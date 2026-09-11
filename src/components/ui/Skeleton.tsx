interface Props {
    rows?: number
}

export default function Skeleton({
    rows = 3
}: Props) {

    return (
        <div className="animate-pulse space-y-4 transition-all duration-300">
            <div className="h-8 rounded bg-gray-200"></div>

            {
                Array.from({ length: rows }).map((_, index) => (
                    <div key={index} className="h-10 rounded bg-gray-200" />
                ))
            }
        </div>
    )
}