"use client";

import { motion } from "motion/react";
import React, { useState } from "react";

import { cn } from "@/lib/utils";

export interface ExpandImage { src: string; alt: string }

/** A row of slivers; the one under the pointer (or focus) opens to show the whole picture. */
const HoverExpand_001 = ({ images, className }: { images: ExpandImage[]; className?: string }) => {
  const [active, setActive] = useState(1);

  return (
    <div className={cn("flex h-[26rem] w-full gap-1.5 md:h-[34rem]", className)}>
      {images.map((image, index) => {
        const open = active === index;
        return (
          <motion.button
            key={image.src}
            type="button"
            aria-label={image.alt}
            aria-pressed={open}
            className="relative h-full min-w-0 cursor-pointer overflow-hidden rounded-md bg-secondary outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
            initial={false}
            animate={{ flexGrow: open ? 7 : 1 }}
            style={{ flexBasis: 0 }}
            transition={{ type: "spring", duration: 0.6, bounce: 0 }}
            onClick={() => setActive(index)}
            onHoverStart={() => setActive(index)}
            onFocus={() => setActive(index)}
          >
            <img
              src={image.src}
              alt=""
              loading="lazy"
              className={cn("absolute inset-0 size-full origin-top scale-[1.08] object-cover object-[50%_18%] transition-[filter] duration-500", open ? "grayscale-0" : "brightness-75 grayscale")}
            />
          </motion.button>
        );
      })}
    </div>
  );
};

export { HoverExpand_001 };

/**
 * Skiper 52 HoverExpand_001 — React + Framer Motion
 *
 * License & Usage:
 * - Free to use and modify in both personal and commercial projects.
 * - Attribution to Skiper UI is required when using the free version.
 * - No attribution required with Skiper UI Pro.
 *
 * Author: @gurvinder-singh02
 * Website: https://gxuri.me
 * Twitter: https://x.com/Gur__vi
 */
