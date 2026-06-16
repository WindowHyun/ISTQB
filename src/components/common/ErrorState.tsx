export function ErrorState({ message }: { message: string }) {
  return <div className="state-card error" role="alert">{message}</div>;
}
