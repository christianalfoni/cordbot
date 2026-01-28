import express from 'express';
import { Server } from 'http';
import open from 'open';
import chalk from 'chalk';
import ora from 'ora';

interface AuthResult {
  botToken: string;
  guildId: string;
}

const WEB_SERVICE_URL = process.env.WEB_SERVICE_URL || 'https://cordbot.io';

export async function authenticateWithWebService(): Promise<AuthResult | null> {
  // Find available port
  const port = await findAvailablePort(3456);
  const callbackUrl = `http://localhost:${port}/callback`;

  console.log(chalk.cyan('\n🔐 Cordbot Authentication\n'));
  console.log(chalk.gray('To use Cordbot, you need to authenticate with the web service.\n'));
  console.log(chalk.yellow('Press ENTER to open your browser and sign in...'));

  // Set stdin to raw mode temporarily
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();

  // Wait for user to press ENTER
  await waitForEnter();

  // Restore stdin
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }

  // Start local server
  const result = await startCallbackServer(port, callbackUrl);

  return result;
}

async function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    const onData = (key: Buffer) => {
      // Check for Enter key (carriage return or newline)
      if (key[0] === 13 || key[0] === 10) {
        process.stdin.removeListener('data', onData);
        resolve();
      }
    };
    process.stdin.on('data', onData);
  });
}

async function findAvailablePort(startPort: number): Promise<number> {
  let port = startPort;
  while (port < startPort + 100) {
    try {
      await new Promise<void>((resolve, reject) => {
        const server = express().listen(port)
          .on('listening', () => {
            server.close();
            resolve();
          })
          .on('error', reject);
      });
      return port;
    } catch {
      port++;
    }
  }
  throw new Error('Could not find available port');
}

async function startCallbackServer(port: number, callbackUrl: string): Promise<AuthResult | null> {
  return new Promise((resolve) => {
    const app = express();
    let server: Server;

    const spinner = ora('Waiting for authentication...').start();

    // Timeout after 5 minutes
    const timeout = setTimeout(() => {
      spinner.fail(chalk.red('Authentication timed out'));
      server?.close();
      resolve(null);
    }, 5 * 60 * 1000);

    app.get('/callback', (req, res) => {
      const { token, guildId, error } = req.query;

      if (error) {
        spinner.fail(chalk.red('Authentication failed'));

        if (error === 'no_bot') {
          console.log(chalk.yellow('\n⚠️  No bot configured'));
          console.log(chalk.gray(`\nPlease visit ${WEB_SERVICE_URL} to:`));
          console.log(chalk.gray('  1. Sign in with Discord'));
          console.log(chalk.gray('  2. Set up your Discord bot'));
          console.log(chalk.gray('  3. Configure your bot token'));
          console.log(chalk.gray('\nThen run "npx cordbot" again.\n'));
        } else if (error === 'not_authenticated') {
          console.log(chalk.yellow('\n⚠️  Not authenticated'));
          console.log(chalk.gray(`\nPlease visit ${WEB_SERVICE_URL} to sign in first.\n`));
        } else {
          console.log(chalk.red(`\n❌ Error: ${error}\n`));
        }

        res.send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Cordbot - Authentication Failed</title>
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 100px auto; padding: 20px; text-align: center; }
                .error { color: #dc2626; margin: 20px 0; }
                .message { color: #6b7280; line-height: 1.6; }
              </style>
            </head>
            <body>
              <h1>❌ Authentication Failed</h1>
              <p class="error">${error === 'no_bot' ? 'No bot configured' : error === 'not_authenticated' ? 'Not authenticated' : String(error)}</p>
              <p class="message">Please check the CLI for instructions.</p>
              <p class="message">You can close this window.</p>
            </body>
          </html>
        `);

        clearTimeout(timeout);
        setTimeout(() => {
          server?.close();
          resolve(null);
        }, 2000);
        return;
      }

      if (!token || !guildId) {
        spinner.fail(chalk.red('Invalid response from server'));
        res.send('Invalid response');
        clearTimeout(timeout);
        server?.close();
        resolve(null);
        return;
      }

      spinner.succeed(chalk.green('Successfully authenticated!'));

      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Cordbot - Authentication Successful</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 100px auto; padding: 20px; text-align: center; }
              .success { color: #16a34a; margin: 20px 0; }
              .message { color: #6b7280; line-height: 1.6; }
            </style>
          </head>
          <body>
            <h1>✅ Authentication Successful!</h1>
            <p class="success">Your bot is now authenticated</p>
            <p class="message">You can close this window and return to the CLI.</p>
          </body>
        </html>
      `);

      clearTimeout(timeout);
      setTimeout(() => {
        server?.close();
        resolve({
          botToken: token as string,
          guildId: guildId as string,
        });
      }, 2000);
    });

    server = app.listen(port, () => {
      // Open browser to web service auth page
      const authUrl = `${WEB_SERVICE_URL}/auth/cli?callback=${encodeURIComponent(callbackUrl)}`;
      open(authUrl).catch(err => {
        spinner.warn(chalk.yellow('Could not open browser automatically'));
        console.log(chalk.gray(`\nPlease open this URL in your browser:\n${authUrl}\n`));
      });
    });
  });
}
