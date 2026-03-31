"use client";

import { useState, useEffect } from "react";
import Water from "./water";

export default function WaterOverlay() {
  const [color, setColor] = useState("#7b93ff");

  useEffect(() => {
    const update = () => {
      const val = getComputedStyle(document.documentElement)
        .getPropertyValue("--color-water")
        .trim();
      if (val) setColor(val);
    };
    update();
    // Watch for theme class changes on <html>
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return <Water color={color} />;
}
