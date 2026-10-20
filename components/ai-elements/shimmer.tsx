"use client";

import { cn } from "@/lib/utils";
import { useAnimate } from "motion/react";
import {
  type CSSProperties,
  type ElementType,
  memo,
  useEffect,
  useMemo,
} from "react";

export interface TextShimmerProps {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
}

const ShimmerComponent = ({
  children,
  as: Component = "p",
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) => {
  // Animate the plain element via a scope ref: motion.create(Component) in
  // render would mint a new component type (and remount) on every render.
  const [scope, animate] = useAnimate<HTMLElement>();

  useEffect(() => {
    const controls = animate(
      scope.current,
      { backgroundPosition: ["100% center", "0% center"] },
      {
        repeat: Number.POSITIVE_INFINITY,
        duration,
        ease: "linear",
      }
    );
    return () => controls.stop();
  }, [animate, scope, duration]);

  const dynamicSpread = useMemo(
    () => (children?.length ?? 0) * spread,
    [children, spread]
  );

  return (
    <Component
      className={cn(
        "relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent",
        "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]",
        className
      )}
      ref={scope}
      style={
        {
          "--spread": `${dynamicSpread}px`,
          backgroundPosition: "100% center",
          backgroundImage:
            "var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
        } as CSSProperties
      }
    >
      {children}
    </Component>
  );
};

export const Shimmer = memo(ShimmerComponent);
