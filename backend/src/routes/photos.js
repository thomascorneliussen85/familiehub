import { Router } from 'express';
import fs from 'node:fs';
import { config } from '../config.js';

const router = Router();
const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

router.get('/', (req, res) => {
  fs.mkdirSync(config.photos.dir, { recursive: true });
  const files = fs
    .readdirSync(config.photos.dir)
    .filter((f) => EXTENSIONS.has(f.slice(f.lastIndexOf('.')).toLowerCase()))
    .sort();
  res.json(files.map((name) => ({ name, url: `/photos/${encodeURIComponent(name)}` })));
});

export default router;
