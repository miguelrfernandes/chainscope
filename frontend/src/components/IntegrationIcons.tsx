import Image from "next/image";

type MarkProps = { className?: string };

export function UniswapMark({ className }: MarkProps) {
  return (
    <Image
      src="/logos/uniswap.svg"
      alt="Uniswap"
      width={48}
      height={52}
      className={className}
      unoptimized
    />
  );
}

export function AaveMark({ className }: MarkProps) {
  return (
    <Image
      src="/logos/aave.svg"
      alt="Aave"
      width={48}
      height={48}
      className={className}
      unoptimized
    />
  );
}

export function HederaMark({ className }: MarkProps) {
  return (
    <Image
      src="/logos/hedera.svg"
      alt="Hedera"
      width={48}
      height={48}
      className={className}
      unoptimized
    />
  );
}

export function GraphMark({ className }: MarkProps) {
  return (
    <Image
      src="/logos/thegraph.svg"
      alt="The Graph"
      width={48}
      height={48}
      className={className}
      unoptimized
    />
  );
}
