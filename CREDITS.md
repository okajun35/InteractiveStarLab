# Credits

Interactive Star Lab is built on public astronomical data and open-source
libraries. This file lists third-party material that ships inside the bundle.

## Sky catalogs — d3-celestial

`src/data/dense-stars.json`, `src/data/messier.json` and
`src/data/milkyway.json` are derived from the data files of
[d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf Frohn, via the
vendored catalogs of [Roque Nights](https://github.com/) (same upstream,
BSD-3-Clause). Upstream files used: `stars.6.json` (positions, magnitudes,
B-V colour indices, Hipparcos numbers; sorted brightest-first, magnitude cut 6),
`messier.json` (the 110 Messier objects, constellation derived by ray-casting
the IAU boundaries), and `mw.json` (Milky Way isophote outlines, 5 levels,
Douglas-Peucker simplified, explicitly closed rings).

```
BSD 3-Clause License

Copyright (c) 2015, Olaf Frohn
All rights reserved.
```

Full licence text: <https://github.com/ofrohn/d3-celestial/blob/master/LICENSE>

d3-celestial itself credits the Hipparcos, Yale Bright Star and Gliese
catalogues for the stellar data, and the Messier/NGC catalogues for the
deep-sky objects. In the vendored form, right ascensions are degrees in
`[0, 360)` and Milky Way rings are not cut at the RA seam; `denseCatalog.ts`
converts RA to sidereal hours at load time.

## Ephemerides — astronomy-engine

Sun, Moon and planet positions are computed in the browser with
[astronomy-engine](https://github.com/cosinekitty/astronomy) by Don Cross —
MIT licence.

```
MIT License

Copyright (c) 2019-2025 Don Cross <cosinekitty@gmail.com>
```
