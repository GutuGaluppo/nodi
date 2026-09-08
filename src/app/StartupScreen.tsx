import nodiMark from "../assets/branding/nodi-mark.png";

interface StartupScreenProps {
  status: "loading" | "error";
  onRetry?: () => void;
}

function StartupScreen({ status, onRetry }: StartupScreenProps) {
  return (
    <main className="startup-screen" aria-live="polite">
      <div className="startup-brand">
        <img src={nodiMark} alt="" />
        <p className="section-label startup-brand-label">NODI</p>
      </div>
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
