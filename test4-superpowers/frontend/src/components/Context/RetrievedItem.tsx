import type { RetrievedItem as Item } from "../../types.js";

export function RetrievedItem({ item }: { item: Item }) {
  const tone = item.isError
    ? "bg-red-50 border-red-200 text-red-800"
    : "bg-white border-gray-200 text-gray-800";
  return (
    <div className={`my-1 px-2 py-1 text-xs border rounded ${tone}`}>
      <span className="font-mono text-gray-500 mr-1">{item.toolName}</span>
      <span>{item.summary}</span>
    </div>
  );
}
