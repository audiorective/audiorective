import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export default function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
