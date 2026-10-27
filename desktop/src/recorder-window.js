"use strict";

// Window presentation changes only on state transitions, never on meter ticks.
function recorderPresentation(window, workArea) {
  let compact = null,
    pinned = false,
    raiseTimer;
  const raise = () => {
    if (
      !pinned ||
      window.isDestroyed() ||
      window.isMinimized() ||
      !window.isVisible()
    )
      return;
    window.setAlwaysOnTop(true, "screen-saver");
    window.moveTop(); // Keep the toolbar above other apps without taking their focus.
  };
  window.on("blur", () => {
    clearTimeout(raiseTimer);
    raiseTimer = setTimeout(raise, 80);
  });
  window.on("restore", raise);
  window.on("show", raise);
  window.on("closed", () => clearTimeout(raiseTimer));
  return (state) => {
    const busy = !!(state.active || state.countdown || state.finishing);
    if (compact !== busy) {
      compact = busy;
      const [width, height] = busy ? [480, 64] : [720, 76];
      window.setMinimumSize(width, height);
      window.setSize(width, height, false);
      const area = workArea(window.getBounds()),
        [x, y] = window.getPosition();
      window.setPosition(
        Math.max(area.x, Math.min(x, area.x + area.width - width)),
        Math.max(area.y, Math.min(y, area.y + area.height - height)),
        false,
      );
    }
    if (pinned !== busy) {
      pinned = busy;
      window.setAlwaysOnTop(pinned, "screen-saver");
      if (pinned) window.moveTop();
    }
  };
}
module.exports = { recorderPresentation };
