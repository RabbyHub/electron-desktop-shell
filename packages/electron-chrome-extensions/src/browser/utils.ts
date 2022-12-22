export function ensureSuffix (str: string = '', suffix: string = '/') {
    if (str.endsWith(suffix)) return str
    return str + suffix
}
export function unPrefix (str: string = '', prefix: string | string[] = '/') {
    const prefixes = Array.isArray(prefix) ? prefix : [prefix];

    let ret = str;
    prefixes.forEach(prefix => {
        if (ret.startsWith(prefix)) ret = ret.slice(prefix.length)
    });

    return ret
}