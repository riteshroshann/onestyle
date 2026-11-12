// The folder on the docs overview: each pill is a guide, and picking one opens it.
// FolderFloat is from React Bits (reactbits.dev), restyled in Bespoke's ink and paper.
import { createRoot } from "react-dom/client";
import FolderFloat from "./FolderFloat";

const GUIDES = [
  { label: "Using Bespoke", value: "guide/" },
  { label: "How it is built", value: "developers/" },
  { label: "The tagging ladder", value: "developers/#ladder" },
  { label: "Text analytics", value: "developers/#text-analytics" },
  { label: "Reading pictures", value: "developers/#vision" },
  { label: "Big data", value: "developers/#bda" },
  { label: "MCP server", value: "mcp/" },
  { label: "Contributing", value: "contributing/" },
];

const mount = document.getElementById("folder");
if (mount) {
  const touch = matchMedia("(hover: none)").matches;
  createRoot(mount).render(
    <FolderFloat
      items={GUIDES}
      label="Bespoke docs"
      sublabel={touch ? "Tap to open" : "Hover to open"}
      trigger={touch ? "click" : "hover"}
      defaultOpen={touch}
      closeOnSelect
      physics
      drift={0.5}
      onSelect={(href) => { location.href = href; }}
      folderColor="#0d1117"
      frontColor="#232c3b"
      paperColor="#ffffff"
      itemColor="#ffffff"
      itemTextColor="#0d1117"
      labelColor="#f2f3f5"
      width={220}
      height={156}
      radius={18}
      spread={touch ? 150 : 230}
      lift={30}
      tilt={7}
      openDuration={540}
      stagger={50}
      bounce={0.3}
    />,
  );
}
