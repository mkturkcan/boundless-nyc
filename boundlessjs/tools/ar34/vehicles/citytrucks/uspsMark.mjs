// The Postal Service's eagle-head mark as it reads on the trucks, drawn from scratch (no logo file): a blue field
// leaning forward, a white swept head with a hooked beak facing the field's right edge, three speed cuts through it.
// (x, y, w, h) is the field's box in livery pixels; w < 0 mirrors it.
export function eagle(x, y, w, h, blue = '#1b3a9a') {
  const X = (u) => x + u * w, Y = (v) => y + v * h;
  const field = `M ${X(0.06)} ${Y(0)} L ${X(1)} ${Y(0)} L ${X(0.94)} ${Y(1)} L ${X(0)} ${Y(1)} Z`;
  const head = `M ${X(0.1)} ${Y(0.82)} C ${X(0.28)} ${Y(0.34)} ${X(0.55)} ${Y(0.16)} ${X(0.82)} ${Y(0.2)}
    C ${X(0.9)} ${Y(0.21)} ${X(0.95)} ${Y(0.3)} ${X(0.93)} ${Y(0.42)} C ${X(0.9)} ${Y(0.5)} ${X(0.84)} ${Y(0.47)} ${X(0.86)} ${Y(0.4)}
    C ${X(0.8)} ${Y(0.44)} ${X(0.66)} ${Y(0.47)} ${X(0.55)} ${Y(0.55)} C ${X(0.42)} ${Y(0.64)} ${X(0.3)} ${Y(0.76)} ${X(0.24)} ${Y(0.86)} Z`;
  const cuts = [0.36, 0.47, 0.58].map((v, k) => `<path d='M ${X(0.14 + k * 0.05)} ${Y(v + 0.18)} C ${X(0.4)} ${Y(v)} ${X(0.6)} ${Y(v - 0.08)} ${X(0.8)} ${Y(v - 0.1)}' stroke='${blue}' stroke-width='${Math.abs(h) * 0.025}' fill='none'/>`).join('');
  const eye = `<ellipse cx='${X(0.8)}' cy='${Y(0.29)}' rx='${Math.abs(w) * 0.018}' ry='${Math.abs(h) * 0.025}' fill='${blue}'/>`;
  return `<path d='${field}' fill='${blue}'/><path d='${head}' fill='#fff'/>${cuts}${eye}`;
}
