"""Wire protocol: length-prefixed frames over TCP (docs/api/protocol.md).

Every frame is ``[u32 big-endian length N][u8 kind][N-1 payload bytes]``; kind 1 is a UTF-8 JSON object, kind 2 a
binary blob. A JSON message with ``"blobs": k`` is followed by exactly k blob frames. Requests carry an ``id``;
responses echo it. Unsolicited ``{"event": ...}`` messages (sensor data) are dispatched to listeners on the reader
thread, in arrival order, and always before the response to the ``world.tick`` that produced them.
"""
from __future__ import annotations

import json
import socket
import struct
import threading
import traceback
from typing import Any, Callable, Dict, List, Optional

KIND_JSON = 1
KIND_BLOB = 2


class BoundlessError(RuntimeError):
    """An error reported by the simulator (``code`` is a short machine-readable tag)."""

    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


class ConnectionClosed(BoundlessError):
    def __init__(self, message: str = "the connection to the simulator closed"):
        super().__init__("connection_closed", message)


class _Slot:
    __slots__ = ("event", "result", "error")

    def __init__(self) -> None:
        self.event = threading.Event()
        self.result: Any = None
        self.error: Optional[dict] = None


class Transport:
    """One TCP connection to a boundless server, with a reader thread."""

    def __init__(self, host: str, port: int, timeout: float = 60.0):
        self.host, self.port = host, port
        self.timeout = timeout
        self._sock = socket.create_connection((host, port), timeout=min(timeout, 10.0))
        self._sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        self._sock.settimeout(None)
        self._send_lock = threading.Lock()
        self._pending: Dict[int, _Slot] = {}
        self._next_id = 1
        self._listeners: Dict[int, Callable[[dict, List[memoryview]], None]] = {}
        self._closed = False
        self._close_reason = "the connection to the simulator closed"
        self._reader = threading.Thread(target=self._run, name="boundless-reader", daemon=True)
        self._reader.start()

    # ------------------------------------------------------------------ sending
    def call(self, method: str, params: Optional[dict] = None, timeout: Optional[float] = None) -> Any:
        if self._closed:
            raise ConnectionClosed(self._close_reason)
        slot = _Slot()
        with self._send_lock:
            rid = self._next_id
            self._next_id += 1
            self._pending[rid] = slot
            payload = json.dumps({"id": rid, "method": method, "params": params or {}}, separators=(",", ":")).encode("utf-8")
            try:
                self._sock.sendall(struct.pack(">IB", len(payload) + 1, KIND_JSON) + payload)
            except OSError as e:
                self._pending.pop(rid, None)
                raise ConnectionClosed(f"send failed: {e}") from e
        if not slot.event.wait(self.timeout if timeout is None else timeout):
            self._pending.pop(rid, None)
            raise TimeoutError(f"{method}: no answer from the simulator within {self.timeout if timeout is None else timeout:.0f} s")
        if slot.error is not None:
            if slot.error.get("code") == "connection_closed":
                raise ConnectionClosed(slot.error.get("message", ""))
            raise BoundlessError(slot.error.get("code", "error"), slot.error.get("message", ""))
        return slot.result

    # ------------------------------------------------------------------ listeners
    def add_listener(self, sensor_id: int, fn: Callable[[dict, List[memoryview]], None]) -> None:
        self._listeners[sensor_id] = fn

    def remove_listener(self, sensor_id: int) -> None:
        self._listeners.pop(sensor_id, None)

    # ------------------------------------------------------------------ reading
    def _recv_exact(self, n: int) -> memoryview:
        buf = bytearray(n)
        view = memoryview(buf)
        got = 0
        while got < n:
            k = self._sock.recv_into(view[got:], n - got)
            if k == 0:
                raise ConnectionClosed()
            got += k
        return view

    def _read_frame(self):
        head = self._recv_exact(5)
        n, kind = struct.unpack(">IB", head)
        return kind, self._recv_exact(n - 1)

    def _run(self) -> None:
        try:
            while True:
                kind, payload = self._read_frame()
                if kind != KIND_JSON:
                    continue
                msg = json.loads(bytes(payload).decode("utf-8"))
                blobs = [self._read_frame()[1] for _ in range(int(msg.get("blobs", 0) or 0))]
                if "event" in msg:
                    fn = self._listeners.get(msg.get("sensor"))
                    if fn is not None:
                        try:
                            fn(msg, blobs)
                        except Exception:  # a user callback must never kill the connection
                            traceback.print_exc()
                    continue
                slot = self._pending.pop(msg.get("id"), None)
                if slot is None:
                    continue
                slot.result = msg.get("result")
                slot.error = msg.get("error")
                slot.event.set()
        except (ConnectionClosed, OSError) as e:
            self._close_reason = str(e) or self._close_reason
        finally:
            self._closed = True
            for slot in list(self._pending.values()):
                slot.error = {"code": "connection_closed", "message": self._close_reason}
                slot.event.set()
            self._pending.clear()

    def close(self) -> None:
        self._closed = True
        try:
            self._sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        self._sock.close()
