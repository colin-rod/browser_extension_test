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
        priceBounds: derivePriceBounds(matches),
    };
}

export function applyFilters(matches, state) {
    const hiddenByMissing = { size: 0, brand: 0, price: 0 };
    const visible = [];
    for (const item of matches) {
        if (!passes(item, state, hiddenByMissing)) continue;
        visible.push(item);
    }
    return { visible, hiddenByMissing };
}

function passes(item, state, hiddenByMissing) {
    if (!passesField(item.size, state.sizes, state.includeMissing.size, "size", hiddenByMissing)) return false;
    if (!passesField(item.brand, state.brands, state.includeMissing.brand, "brand", hiddenByMissing)) return false;
    if (!passesPrice(item.price, state.priceRange, state.includeMissing.price, hiddenByMissing)) return false;
    return true;
}

function passesField(value, selectedSet, includeMissing, fieldName, hiddenByMissing) {
    if (selectedSet.size === 0) return true;
    const isMissing = value == null || value === "";
    if (isMissing) {
        if (includeMissing) return true;
        hiddenByMissing[fieldName] += 1;
        return false;
    }
    return selectedSet.has(value);
}

function passesPrice(price, range, includeMissing, hiddenByMissing) {
    if (range === null) return true;
    const isMissing = typeof price !== "number" || !Number.isFinite(price);
    if (isMissing) {
        if (includeMissing) return true;
        hiddenByMissing.price += 1;
        return false;
    }
    return price >= range[0] && price <= range[1];
}

function derivePriceBounds(matches) {
    const prices = matches
        .map((m) => m.price)
        .filter((p) => typeof p === "number" && Number.isFinite(p));
    if (prices.length === 0) return null;
    return [Math.floor(Math.min(...prices)), Math.ceil(Math.max(...prices))];
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
