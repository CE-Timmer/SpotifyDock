interface BackgroundProps {
  hidden: boolean;
}

export function Background({ hidden }: BackgroundProps) {
  return <div className={`overlay-bg${hidden ? " hidden" : ""}`} />;
}
