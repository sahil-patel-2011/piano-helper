import { app, BrowserWindow, Menu } from "electron";

function stripWindowMenu(win: BrowserWindow) {
  win.setMenu(null);
  win.removeMenu();
  win.setMenuBarVisibility(false);
  win.setAutoHideMenuBar(true);
}

/** Kill File / Edit / View / Window / Help for every window, including Alt. */
export function disableAppMenu() {
  Menu.setApplicationMenu(null);
  app.on("browser-window-created", (_event, win) => {
    stripWindowMenu(win);
    win.on("page-title-updated", () => stripWindowMenu(win));
    win.webContents.on("before-input-event", (event, input) => {
      if (input.key === "Alt") event.preventDefault();
    });
  });
  for (const win of BrowserWindow.getAllWindows()) stripWindowMenu(win);
}
