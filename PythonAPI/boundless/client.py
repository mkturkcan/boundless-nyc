"""The entry point: Client(host, port) -> get_world()."""
from __future__ import annotations

import time
from typing import Optional

from . import __version__
from .transport import BoundlessError, Transport
from .world import World


class Client:
    """A connection to a running boundless server (BoundlessNYC.exe, default port 2000).

    The world loads for a minute or two after the server starts; get_world() waits for it (up to the timeout).
    """

    def __init__(self, host: str = "127.0.0.1", port: int = 2000, timeout: float = 120.0, worker_threads: int = 0):
        self.host, self.port = host, port
        deadline = time.time() + timeout
        last: Optional[Exception] = None
        while True:  # the server may still be starting
            try:
                self._transport = Transport(host, port, timeout)
                break
            except OSError as e:
                last = e
                if time.time() > deadline:
                    raise ConnectionError(f"no boundless server on {host}:{port} ({e})") from e
                time.sleep(1.0)
        self._world: Optional[World] = None

    def set_timeout(self, seconds: float) -> None:
        """How long a call waits for an answer (world.tick with many sensors can take a second or two)."""
        self._transport.timeout = float(seconds)

    def get_client_version(self) -> str:
        return __version__

    def get_server_version(self) -> str:
        return self._transport.call("server.status")["server_version"]

    def get_server_info(self) -> dict:
        """api_version, resolution, gpu, frame, timestamp, settings and the map's geo origin."""
        return self._transport.call("server.info")

    def wait_until_ready(self, timeout: float = 300.0) -> dict:
        """Block until the simulator page has booted (the first run compiles shaders: ~1-2 minutes)."""
        deadline = time.time() + timeout
        while True:
            st = self._transport.call("server.status")
            if st.get("ready"):
                return self._transport.call("server.info", timeout=max(30.0, deadline - time.time()))
            if time.time() > deadline:
                raise TimeoutError(f"the server did not finish loading within {timeout:.0f} s")
            time.sleep(1.0)

    def get_world(self) -> World:
        if self._world is None:
            self.wait_until_ready(max(self._transport.timeout, 300.0))
            self._world = World(self)
        return self._world

    def close(self) -> None:
        self._transport.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
