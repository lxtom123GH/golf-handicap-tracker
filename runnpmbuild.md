# Run and Use Production App Locally

To use the production-ready app on your mobile phone without formally deploying it to Firebase, you can build it and host it on your local network.

Run the following commands in your terminal:

```bash
# 1. Ensure all dependencies are installed
npm install

# 2. Build the production application
npm run build

# 3. Serve the production build on your local network
npx serve -s dist
```

### How to open it on your phone:
1. Make sure your computer and your mobile phone are connected to the **same Wi-Fi network**.
2. After running the `npx serve` command above, the terminal will output a **"Network"** address (for example, `http://192.168.1.15:3000`).
3. Open the web browser on your mobile phone and type in that exact Network URL.

You will now be using the compiled, production version of the app directly from your phone!