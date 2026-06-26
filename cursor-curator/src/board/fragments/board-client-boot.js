loadSettings()
  .then(loadBoard)
  .then((live) => {
    if (live) {
      setLiveState("Live", true);
      rememberCurrentBoard();
      loadBoardSwitcher();
      window.setInterval(loadBoardSwitcher, 5000);
      connectEvents();
    } else {
      setLiveState("Snapshot", false);
    }
    loadGithubStars();
  })
  .catch((error) => {
    setLiveState("Offline", false);
    boardEl.replaceChildren(renderBoardError(error.message));
  });

