export function emptyFilterState() {
    return {
        sizes: new Set(),
        brands: new Set(),
        priceRange: null,
        includeMissing: { size: false, brand: false, price: false },
    };
}

export function deriveFilterOptions(matches) {
    if (!matches || matches.length === 0) {
        return { sizes: [], brands: [], priceBounds: null };
    }
    return {
        sizes: countAndSort(matches, "size"),
        brands: countAndSort(matches, "brand"),
        priceBounds: null,
    };
}

function countAndSort(matches, field) {
    const counts = new Map();
    for (const m of matches) {
        const v = m[field];
        if (v == null || v === "") continue;
        counts.set(v, (counts.get(v) || 0) + 1);
    }
    return [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}
