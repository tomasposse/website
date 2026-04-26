const canvas = document.getElementById("glCanvas");
const gl = canvas.getContext("webgl");
if (!gl) alert("WebGL not supported");

const vsSource = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const simFS = `
precision mediump float;
uniform sampler2D u_buf;
uniform vec2 u_res;
uniform float u_time;
void main() {
    vec2 uv = gl_FragCoord.xy / u_res;
    vec2 z = (uv - 0.5) * 0.995 + 0.5;
    vec3 col = texture2D(u_buf, z).rgb;
    vec2 pos = 0.5 + 0.3 * vec2(sin(u_time), cos(u_time));
    float d = length(uv - pos);
    col += vec3(exp(-40.0 * d * d));
    col *= 0.995;
    gl_FragColor = vec4(col, 1.0);
}
`;

const renderFS = `
precision mediump float;
uniform sampler2D u_buf;
uniform vec2 u_res;
void main() {
    vec2 uv = gl_FragCoord.xy / u_res;
    vec3 col = texture2D(u_buf, uv).rgb;
    col = col / (1.0 + col);
    col = pow(col, vec3(0.8));
    gl_FragColor = vec4(col, 1.0);
}
`;

function makeProgram(vsSrc, fsSrc) {
    function compile(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return s;
    }
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    return p;
}

const quad = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quad);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1
]), gl.STATIC_DRAW);

function makeUniforms(prog) {
    gl.useProgram(prog);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    return {
        buf: gl.getUniformLocation(prog, "u_buf"),
        res: gl.getUniformLocation(prog, "u_res"),
        time: gl.getUniformLocation(prog, "u_time"),
    };
}

const simProg   = makeProgram(vsSource, simFS);
const renderProg = makeProgram(vsSource, renderFS);
const simU   = makeUniforms(simProg);
const renderU = makeUniforms(renderProg);

function createFBO(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo };
}

let A, B;

function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;  // wait for layout
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width  * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width === w && canvas.height === h) return;
    canvas.width  = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
    A = createFBO(w, h);
    B = createFBO(w, h);
}

new ResizeObserver(resize).observe(canvas.parentElement);
// defer so flex layout has resolved before first read
requestAnimationFrame(resize);


resize();

function render(ms) {
    if (!A) { requestAnimationFrame(render); return; }
    const t = ms * 0.001;
    const w = canvas.width, h = canvas.height;

    gl.useProgram(simProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bindFramebuffer(gl.FRAMEBUFFER, B.fbo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, A.tex);
    gl.uniform1i(simU.buf, 0);
    gl.uniform2f(simU.res, w, h);
    gl.uniform1f(simU.time, t);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.useProgram(renderProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, B.tex);
    gl.uniform1i(renderU.buf, 0);
    gl.uniform2f(renderU.res, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    [A, B] = [B, A];
    requestAnimationFrame(render);
}

requestAnimationFrame(render);