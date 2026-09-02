export type ClaudeStatus = {
  cliPath: string | null;
  cliFound: boolean;
  cliLoggedIn: boolean;
  loggedIn: boolean;
  usingSubscription: boolean;
  apiKeyInEnv: boolean;
  mcpRegistered: boolean;
  mcpTargets: string[];
  command: string[];
  message: string;
  desktopAppFound: boolean;
  desktopRunning: boolean;
  desktopSignedIn: boolean;
  desktopConfigPath: string | null;
};
