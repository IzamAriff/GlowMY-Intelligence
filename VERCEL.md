# Deploy this app on Vercel

Do **not** use Framework Preset = **Other / None**.
Use **Next.js**.

The Next.js `package.json` is in the **g2g-intel** folder, not the repo root.
That is why you saw: “No Next.js version detected”.

## Correct Vercel settings

1. Import the Git repo.
2. **Root Directory** → click **Edit** → set to:

   ```
   g2g-intel
   ```

   (Must be the folder that contains `package.json` with `"next": "14.2.35"`.)

3. **Framework Preset** → **Next.js**  
   After you set Root Directory, Vercel should auto-detect Next.js.

4. Leave these as defaults:
   - Build Command: `next build`
   - Output Directory: *(leave empty — not `out` or `dist`)*
   - Install Command: `npm install`
   - Node.js: **20.x**

5. Optional env vars: `GEMINI_API_KEY`, `OPENAI_API_KEY`, `SERPAPI_KEY`

Then Redeploy.
