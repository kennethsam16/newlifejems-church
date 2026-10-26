import { cp, mkdir, rm } from "node:fs/promises";

const root = new URL("./", import.meta.url);
const output = new URL("./dist/", root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of [
  "index.html",
  "admin.html",
  "robots.txt",
  "sitemap.xml",
  "founder.jpg",
  "newlifejems-church-logo.png",
  "pastor-pash-isaac-daniel.jpg",
]) {
  await cp(new URL(file, root), new URL(file, output));
}
console.log("Built NewLifeJems public website in dist/.");


