// AR33 sk: a plain-array geometry accumulator (no three, so the builders run in node for the offline previews).
export class Buf {
  // alpha: a fourth colour component per vertex (a soft-edged overlay drawn transparent: skCovers.REPAVES)
  constructor(alpha = false) { this.p = []; this.n = []; this.t = []; this.c = []; this.i = []; this.al = alpha ? [] : null; }
  get verts() { return this.p.length / 3; }
  get tris() { return this.i.length / 3; }
  // a vertex: position, normal, uv (metres), colour (linear multiplier), alpha (kept only by an alpha buffer)
  v(x, y, z, nx, ny, nz, u, v, r = 1, g = 1, b = 1, a = 1) {
    const k = this.p.length / 3;
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.t.push(u, v); this.c.push(r, g, b);
    if (this.al) this.al.push(a);
    return k;
  }
  tri(a, b, c) { this.i.push(a, b, c); }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
  fan(idx) { for (let k = 1; k + 1 < idx.length; k++) this.i.push(idx[0], idx[k], idx[k + 1]); }
  // bounding box of the positions
  bbox() {
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (let k = 0; k < this.p.length; k += 3) {
      x0 = Math.min(x0, this.p[k]); x1 = Math.max(x1, this.p[k]); y0 = Math.min(y0, this.p[k + 1]); y1 = Math.max(y1, this.p[k + 1]);
      z0 = Math.min(z0, this.p[k + 2]); z1 = Math.max(z1, this.p[k + 2]);
    }
    return [x0, y0, z0, x1, y1, z1];
  }
  // typed arrays, positions made relative to (cx, cz) so a mesh can sit at the chunk centre (float precision and LOD)
  arrays(cx = 0, cz = 0) {
    const pos = new Float32Array(this.p);
    if (cx || cz) for (let k = 0; k < pos.length; k += 3) { pos[k] -= cx; pos[k + 2] -= cz; }
    let color;
    if (this.al) { color = new Float32Array(this.al.length * 4); for (let k = 0; k < this.al.length; k++) { color[k * 4] = this.c[k * 3]; color[k * 4 + 1] = this.c[k * 3 + 1]; color[k * 4 + 2] = this.c[k * 3 + 2]; color[k * 4 + 3] = this.al[k]; } }
    else color = new Float32Array(this.c);
    return { position: pos, normal: new Float32Array(this.n), uv: new Float32Array(this.t), color, index: new Uint32Array(this.i) };
  }
}
