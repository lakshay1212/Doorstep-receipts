# Running it without localhost

Three routes. They are not exclusive: most people use A while building and B for the submission.

## A. Instant public URL from your laptop (about 2 minutes)

Good for testing from your phone, for a screen recording that shows a real URL, and for pointing
a webhook at your machine. The laptop must stay on, and the URL changes each run.

Keep `npm start` running, then in a second terminal use either tool (install it first):

```bash
cloudflared tunnel --url http://localhost:3000     # prints a https://<random>.trycloudflare.com URL
# or
ngrok http 3000
```

These are the standard commands for each tool. Check their current docs if one has changed.

## B. Vercel (1-Click Serverless Deployment)

The project includes pre-configured `vercel.json` and `api/index.ts` serverless handler with automatic `/tmp` persistence and demo visit seeding.

1. Go to **[vercel.com/new](https://vercel.com/new)** and sign in with GitHub.
2. Under "Import Git Repository", select **`lakshay1212/Doorstep-receipts`**.
3. Framework Preset: Leave as **Other** (Vercel automatically picks up `vercel.json`).
4. (Optional) Add Environment Variables:
   - `ENABLE_SIMULATOR`: `true`
   - `RING_WEBHOOK_SIGNING_KEY`: (optional, defaults to safe demo key)
   - `BEDROCK_MODEL_ID`: `anthropic.claude-3-haiku-20240307-v1:0` (if using AWS Bedrock)
5. Click **Deploy**. Your permanent `https://doorstep-receipts-xxx.vercel.app` will be live in ~30 seconds!

## C. A hosted container service (Render, Railway, Fly.io)

This is an alternative if you prefer a continuous long-running Node 22 process:

What Render's free web service does, per its docs:
- It spins down after 15 minutes without traffic and wakes on the next request, so the first
  visit after a quiet spell is slow.
- Its filesystem is ephemeral, so the JSON data file is wiped on every restart, redeploy and
  spin-down.

Both are fine for a judging demo, because **Try the demo** recreates everything in one click.
Open the link yourself a minute before you submit, so it is awake.

Steps:

1. Push the project to a GitHub repo. This is also your submission repo, so keep the MIT license.
2. In Render: New, then Web Service, then connect the repo.
3. Settings:
   - Build command: `npm ci`
   - Start command: `npm start`
   - Make sure it runs Node 22 or newer (the package declares this in `engines`, and most hosts
     also accept a `NODE_VERSION` variable).
4. Environment variables:

   | Variable | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `RING_WEBHOOK_SIGNING_KEY` | a long random string, for example from `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `ENABLE_SIMULATOR` | `true` (demo only) |
   | `BEDROCK_MODEL_ID`, `AWS_REGION` | optional, for Bedrock summaries |
   | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | only if you use Bedrock from a non-AWS host. Use an IAM user that can do nothing except invoke the one model. |

   The host provides `PORT` itself, and the app reads it.
5. Deploy, then open `https://<your-service>/healthz`. You should see `{"ok":true}`.
6. Open the root URL and click **Try the demo**. Open the receipt link it creates and check that
   it starts with `https://`.

Menu names change, so treat step 2 and 3 as a guide rather than an exact script.

## C. AWS

AWS App Runner stopped accepting new customers on April 30, 2026, and AWS points new container
projects to Amazon ECS Express Mode. Express Mode needs a container image, and the repo has a
`Dockerfile` for that. I did not run the Dockerfile or an AWS deployment, so build and test it
locally first:

```bash
docker build -t doorstep-receipts .
docker run -p 3000:3000 -e RING_WEBHOOK_SIGNING_KEY=test -e ENABLE_SIMULATOR=true doorstep-receipts
```

Then push the image to Amazon ECR and create the service by following the current ECS Express
Mode documentation. On AWS, give the service a task role that can invoke the one Bedrock model
instead of storing access keys. Running there also makes the AWS story in your video easy to
tell. AWS charges for this, so set a billing alarm first.

## Before the URL goes public

- **The demo is open to anyone with the link.** Anyone can create visits and use the simulator.
  Do not put real data in it. It stops accepting new visits at `MAX_VISITS` (200 by default).
  To lock it instead, set `DASHBOARD_API_KEY` and put the key in your testing instructions.
- **Real Ring traffic needs an always-on instance.** Ring retries failed deliveries, but it
  expects an answer within 5 seconds, which a sleeping free instance may miss. For real events
  use an instance that does not spin down, set `ENABLE_SIMULATOR=false`, and set a dashboard key.
- Ring needs an HTTPS URL for the webhook: `https://<your-service>/webhooks/ring`.
- If receipt links come out as `http://`, set `PUBLIC_BASE_URL` to your public address.
