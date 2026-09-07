interface StartupScreenProps {
  status: "loading" | "error";
  onRetry?: () => void;
}

function StartupScreen({ status, onRetry }: StartupScreenProps) {
  return (
    <main className="startup-screen" aria-live="polite">
      <p className="section-label">NODI</p>
      {status === "loading" ? (
        <>
          <h1>Opening your library</h1>
          <p>Your notes stay on this Mac.</p>
        </>
      ) : (
        <>
          <h1>Could not open your library</h1>
          <p>
            Your data was not changed. Try opening the local database again.
          </p>
          {onRetry ? (
            <button className="primary-button" type="button" onClick={onRetry}>
              Try again
            </button>
          ) : null}
        </>
      )}
    </main>
  );
}

export default StartupScreen;
