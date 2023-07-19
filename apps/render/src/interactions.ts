function toggleEditMode(graphEntryContainerId: string, islandId: string) {
  const container = document.getElementById(
    graphEntryContainerId
  ) as HTMLDivElement;
  container.classList.toggle("show");
  const islandDiv = document.getElementById(islandId) as HTMLDivElement;
  islandDiv.classList.toggle("edit");
}

export function setupEditIconInteraction(
  iconId: string,
  graphEntryContainerId: string,
  islandId: string
) {
  const iconElem = document.getElementById(iconId);
  if (!iconElem) {
    throw new Error("Could not locate edit icon in DOM");
  }

  let keyPressListener: ((e: KeyboardEvent) => void) | null = null;
  const escListener = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      toggleEditMode(graphEntryContainerId, islandId);
      if (keyPressListener) {
        document.removeEventListener("keydown", keyPressListener);
        keyPressListener = null;
      }
    }
  };

  iconElem.addEventListener("click", () => {
    if (keyPressListener != null) {
      document.removeEventListener("keydown", keyPressListener);
      keyPressListener = escListener;
    } else {
      document.addEventListener("keydown", escListener);
      keyPressListener = escListener;
    }
    toggleEditMode(graphEntryContainerId, islandId);
  });
}

function toggleInfoMode(islandId: string) {
  const islandDiv = document.getElementById(islandId) as HTMLDivElement;
  islandDiv.classList.toggle("expanded");
  islandDiv.classList.toggle("info");
}

export function setupInfoIconInteraction(iconId: string, islandId: string) {
  const iconElem = document.getElementById(iconId);
  if (!iconElem) {
    throw new Error("Could not locate info icon in DOM");
  }
  let keyPressListener: ((e: KeyboardEvent) => void) | null = null;
  const escListener = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      toggleInfoMode(islandId);
      if (keyPressListener != null) {
        document.removeEventListener("keydown", keyPressListener);
        keyPressListener = null;
      }
    }
  };
  iconElem.addEventListener("click", () => {
    if (keyPressListener != null) {
      document.removeEventListener("keydown", keyPressListener);
      keyPressListener = null;
    } else {
      document.addEventListener("keydown", escListener);
      keyPressListener = escListener;
    }
    toggleInfoMode(islandId);
  });
}

export function setupLinkInteraction(iconId: string, destination: string) {
  const iconElem = document.getElementById(iconId);
  if (!iconElem) {
    throw new Error("Could not locate link icon in DOM");
  }

  iconElem.addEventListener("click", () => {
    if (window != null) {
      window?.open(destination, "_blank")?.focus();
    }
  });
}
