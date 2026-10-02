import Image from "next/image";

const TILES = [
  "linear-gradient(135deg, #e9e3ff 0%, #d9ccff 100%)",
  "linear-gradient(135deg, #ffe4d6 0%, #ffd0b8 100%)",
  "linear-gradient(135deg, #ffe0e8 0%, #ffc9d6 100%)",
  "linear-gradient(135deg, #dff5ec 0%, #c6ecd9 100%)",
  "linear-gradient(135deg, #fff2cc 0%, #ffe6a3 100%)",
];

function tileFor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return TILES[Math.abs(h) % TILES.length];
}

type Props = {
  name: string;
  categoryId: string;
  imageUrl: string | null;
  className: string;
  sizes: string;
  priority?: boolean;
};

/** Photo, or a stable pastel tile with the product's initial. */
export function ProductMark({ name, categoryId, imageUrl, className, sizes, priority = false }: Props) {
  if (imageUrl) {
    return (
      <Image
        src={imageUrl}
        alt=""
        width={800}
        height={600}
        sizes={sizes}
        priority={priority}
        className={["object-cover", className].join(" ")}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={["font-display grid place-items-center font-semibold tracking-tight text-foreground/70", className].join(" ")}
      style={{ background: tileFor(categoryId) }}
    >
      {name.charAt(0)}
    </span>
  );
}
