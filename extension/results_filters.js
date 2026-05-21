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
    return { sizes: [], brands: [], priceBounds: null };
}
