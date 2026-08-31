const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const router = express.Router();
const PLANS_DIR = process.env.STRIDE_PLANS_PATH || path.join(os.homedir(), '.stride', 'plans');

router.get('/', (req, res) => {
  fs.mkdirSync(PLANS_DIR, { recursive: true });
  const files = fs.readdirSync(PLANS_DIR)
    .filter(f => f.endsWith('.md'))
    .sort()
    .map(f => {
      const slug = f.replace(/\.md$/, '');
      const content = fs.readFileSync(path.join(PLANS_DIR, f), 'utf8');
      const titleMatch = content.match(/^#\s+(.+)/m);
      const addedMatch = content.match(/^>\s*Added:\s*(.+)/m);
      return {
        slug,
        title: titleMatch ? titleMatch[1].trim() : slug,
        added: addedMatch ? addedMatch[1].trim() : null,
      };
    });
  res.json({ plans: files });
});

router.get('/:slug', (req, res) => {
  const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
  const filePath = path.join(PLANS_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Plan not found' });
  const content = fs.readFileSync(filePath, 'utf8');
  res.json({ slug, content });
});

router.delete('/:slug', (req, res) => {
  const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
  const filePath = path.join(PLANS_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Plan not found' });
  fs.unlinkSync(filePath);
  res.json({ ok: true });
});

module.exports = router;
