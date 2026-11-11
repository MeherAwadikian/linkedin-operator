LinkedIn Operator — quick start
================================

1. Make sure Google Chrome is installed (https://www.google.com/chrome).

2. Double-click:  START.bat

   The first run installs everything it needs (Node, pnpm, cloudflared) and the
   project dependencies, then starts the worker, opens a secure tunnel, and opens
   the app in your browser. First run can take a few minutes.

3. In the app (it opens automatically, no login):
      - Settings  -> enter your LinkedIn email + password, and your Anthropic
        (Claude) API key.
      - Campaigns -> pick a network + search + message, click "Create & collect".
        Review and approve each outreach in the Approval Queue.

   The first LinkedIn action opens a Chrome window so you can pass any 2-step
   verification. Keep it logged in.

To stop the worker + tunnel:  double-click STOP.bat
To start again later:         double-click START.bat

Notes
-----
- Keep this folder private: it contains shared access keys.
- If Windows SmartScreen warns about START.bat, choose "More info" -> "Run anyway"
  (it's just a local script).
- Details and troubleshooting: CLIENT_SETUP.md
