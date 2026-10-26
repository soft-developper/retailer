export default function SkeletonCard({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`bg-white/80 border border-[rgba(15,23,42,0.06)] rounded-2xl p-5 animate-pulse ${className}`}>
      <div className="h-4 bg-[rgba(15,23,42,0.07)] rounded w-1/3 mb-4" />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`h-3 bg-[rgba(15,23,42,0.05)] rounded mb-2 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`}
        />
      ))}
    </div>
  )
}
