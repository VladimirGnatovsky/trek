import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frames = path.join(root, ".video-frames");
const output = path.join(root, "assets", "trek-mobile-guide.webm");
const total = 300;
const fps = 12;
const profile = fs.mkdtempSync("/tmp/trek-video-");
let chrome;

const page = `<!doctype html><meta charset="utf-8"><canvas width="1080" height="1920"></canvas><script>
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
const total=${total},fps=${fps},images=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function load(){for(let i=0;i<total;i++){const img=new Image();img.src='/frame/'+String(i).padStart(4,'0')+'.jpg';await img.decode();images.push(img)}}
async function run(){
 await load(); ctx.drawImage(images[0],0,0);
 const stream=canvas.captureStream(fps);
 const type=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm;codecs=vp8';
 const rec=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:5000000}),parts=[];
 rec.ondataavailable=e=>e.data.size&&parts.push(e.data);
 rec.onstop=async()=>{const blob=new Blob(parts,{type});await fetch('/upload',{method:'POST',body:blob});document.body.dataset.done='true'};
 rec.start(1000);
 const started=performance.now();
 for(let i=0;i<total;i++){ctx.drawImage(images[i],0,0);const target=started+(i+1)*1000/fps;await sleep(Math.max(0,target-performance.now()))}
 rec.stop();
}
run();
</script>`;

const server = http.createServer((req, res) => {
  if (req.url === "/") { console.log("Recorder opened"); res.setHeader("content-type", "text/html"); return res.end(page); }
  if (req.url?.startsWith("/frame/")) {
    const name = path.basename(req.url);
    if (!/^\d{4}\.jpg$/.test(name)) { res.statusCode = 404; return res.end(); }
    res.setHeader("content-type", "image/jpeg"); return fs.createReadStream(path.join(frames, name)).pipe(res);
  }
  if (req.url === "/upload" && req.method === "POST") {
    console.log("Receiving WebM");
    const file = fs.createWriteStream(output); req.pipe(file);
    req.on("end", () => file.end(() => {
      res.end("ok");
      setTimeout(() => { chrome?.kill("SIGTERM"); server.close(() => process.exit(0)); }, 300);
    }));
    return;
  }
  res.statusCode = 404; res.end();
});

server.listen(process.env.TREK_EXTERNAL_BROWSER ? 8877 : 0, "127.0.0.1", () => {
  const { port } = server.address();
  if (process.env.TREK_EXTERNAL_BROWSER) {
    console.log(`Open http://127.0.0.1:${port}/`);
    return;
  }
  chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
    "--autoplay-policy=no-user-gesture-required", `--user-data-dir=${profile}`, `http://127.0.0.1:${port}/`,
  ], { stdio: ["ignore", "ignore", "inherit"] });
  chrome.on("exit", code => console.log("Chrome exited", code));
  setTimeout(() => { console.error("Video recording timed out"); chrome?.kill("SIGTERM"); process.exit(1); }, 90_000).unref();
});
