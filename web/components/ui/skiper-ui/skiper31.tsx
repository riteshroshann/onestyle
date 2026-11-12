"use client";

import { motion, useTransform } from "motion/react";
import type { MotionValue } from "motion/react";
import React from "react";

import { cn } from "@/lib/utils";

type CharacterProps = {
  char: string;
  index: number;
  centerIndex: number;
  scrollYProgress: MotionValue<number>;
  className?: string;
};

/** A letter that starts flung out from the centre, tilted, and settles into the word as the page scrolls. */
const CharacterV1 = ({ char, index, centerIndex, scrollYProgress, className }: CharacterProps) => {
  const isSpace = char === " ";
  const distanceFromCenter = index - centerIndex;

  const x = useTransform(scrollYProgress, [0, 0.5], [distanceFromCenter * 50, 0]);
  const rotateX = useTransform(scrollYProgress, [0, 0.5], [distanceFromCenter * 50, 0]);

  return (
    <motion.span className={cn("inline-block", isSpace && "w-[0.3em]", className)} style={{ x, rotateX }}>
      {char}
    </motion.span>
  );
};

/** A picture that starts fanned out and rotated, and falls into a level row as the page scrolls. */
const CharacterV3 = ({ char, index, centerIndex, scrollYProgress, className }: CharacterProps) => {
  const distanceFromCenter = index - centerIndex;

  const x = useTransform(scrollYProgress, [0, 0.5], [distanceFromCenter * 90, 0]);
  const rotate = useTransform(scrollYProgress, [0, 0.5], [distanceFromCenter * 50, 0]);
  const y = useTransform(scrollYProgress, [0, 0.5], [-Math.abs(distanceFromCenter) * 20, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.5], [0.75, 1]);

  return (
    <motion.img
      src={char}
      alt=""
      loading="lazy"
      className={cn("inline-block object-cover", className)}
      style={{ x, rotate, y, scale, transformOrigin: "center" }}
    />
  );
};

export { CharacterV1, CharacterV3 };

/**
 * Skiper 31 ScrollAnimation_002 — React + framer motion + lenis
 *
 * License & Usage:
 * - Free to use and modify in both personal and commercial projects.
 * - Attribution to Skiper UI is required when using the free version.
 * - No attribution required with Skiper UI Pro.
 *
 * Feedback and contributions are welcome.
 *
 * Author: @gurvinder-singh02
 * Website: https://gxuri.me
 * Twitter: https://x.com/Gur__vi
 */
