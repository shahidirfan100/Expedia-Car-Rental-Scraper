# Expedia Car Rental Scraper

Collect Expedia car rental offers from search results and turn them into structured datasets for pricing analysis, market tracking, and travel intelligence workflows.

---

## Features

- **Car offer extraction** - Capture Expedia car listings with offer tokens, vehicle info, and reserve metadata.
- **Pricing visibility** - Collect lead/total pricing text and accessibility pricing notes.
- **Vehicle detail coverage** - Save category, description, attributes, and image links.
- **Offer continuation data** - Store continuation context and selection metadata for downstream processing.
- **Clean output** - Empty or null values are removed automatically from each record.

---

## Use Cases

### Rental Price Monitoring
Track daily or weekly pricing movement for key destinations and pickup windows.

### Fleet and Vendor Comparison
Compare vehicle categories and offer structure across suppliers and routes.

### Travel Product Research
Build structured car-rental datasets for internal analytics and product planning.

### Offer Token Pipelines
Use saved offer tokens and continuation context IDs for follow-up enrichment flows.

---

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startUrl` | String | No | Las Vegas Expedia carsearch URL | Full Expedia car rental search URL. The actor reads location, region, dates, and times from this URL and always prioritizes it. |
| `results_wanted` | Integer | No | `20` | Maximum number of offers to save. |
| `max_pages` | Integer | No | `8` | Maximum API pages to request. |
| `proxyConfiguration` | Object | No | Apify residential proxy | Proxy settings for reliable extraction. |

Built-in behavior:
The actor now always auto-heals messy Expedia URLs and always uses resilient request recovery internally, so those switches are no longer exposed as inputs.

---

## Output Data

Each dataset item can contain:

| Field | Type | Description |
|-------|------|-------------|
| `car_offer_token` | String | Expedia offer token for continuation. |
| `offer_heading` | String | Main listing title. |
| `reserve_button_text` | String | Reserve CTA text. |
| `accessibility_string` | String | Accessibility summary text for listing card. |
| `infosite_url` | String | Expedia details URL for the offer. |
| `vehicle_category` | String | Vehicle category label. |
| `vehicle_description` | String | Vehicle description text. |
| `vehicle_image_url` | String | Vehicle image URL. |
| `vendor_image_url` | String | Vendor image URL. |
| `vehicle_attributes` | Array | Vehicle attributes from listing card. |
| `review_rating` | Number | Numeric rating value. |
| `review_label` | String | Review superlative text. |
| `review_count` | Integer | Number of reviews. |
| `price_lead` | String | Lead price text. |
| `price_total` | String | Total price text. |
| `price_accessibility` | String | Accessibility pricing text. |
| `strike_through_first` | Boolean | Whether strike-through appears first. |
| `multi_item_price_token` | String | Multi-item pricing token. |
| `fare_comparison_enabled` | Boolean | Fare comparison flag. |
| `price_summary_text` | String | Price summary text field. |
| `selected_accessories` | Array | Selected accessory values. |
| `reward_points_selection` | String | Rewards selection value. |
| `continuation_contextual_id` | String | Context ID for continuation. |
| `search_id` | String | Search identifier from result context. |
| `pick_up_location` | String | Pickup location used for request. |
| `drop_off_location` | String | Drop-off location used for request. |
| `pick_up_region` | String | Pickup region ID used. |
| `drop_off_region` | String | Drop-off region ID used. |
| `pick_up_date` | String | Pickup date in `YYYY-MM-DD`. |
| `drop_off_date` | String | Drop-off date in `YYYY-MM-DD`. |
| `pick_up_time` | String | Pickup time used. |
| `drop_off_time` | String | Drop-off time used. |
| `page_index` | Integer | Zero-based page index. |
| `operation_name` | String | Operation name used for extraction. |
| `scraped_at` | String | ISO capture timestamp. |

---

## Usage Examples

### Start URL Run

```json
{
	"startUrl": "https://www.expedia.com/carsearch?paandi=true&fdrp=1&styp=2&dagv=1&subm=1&locn=Las%20Vegas,%20Nevada,%20United%20States%20of%20America&dpln=178276&date1=4/22/2026&date2=4/24/2026&crfrr=defaultFlex&SearchType=Place",
	"results_wanted": 20,
	"max_pages": 8
}
```

### Messy Wrapped URL Run

```json
{
	"startUrl": "  https%3A%2F%2Fwww.expedia.com%2Fcarsearch%3Flocn%3DMiami%252C%2520Florida%252C%2520United%2520States%2520of%2520America%26dpln%3D178286%26date1%3D5%2F10%2F2026%26date2%3D5%2F12%2F2026%26time1%3D0900AM%26time2%3D0800PM%26SearchType%3DPlace%26subm%3D1%26fdrp%3D1  ",
	"results_wanted": 40,
	"max_pages": 10
}
```

### Proxy-Optimized Run

```json
{
	"startUrl": "https://www.expedia.com/carsearch?paandi=true&fdrp=1&styp=2&dagv=1&subm=1&locn=Las%20Vegas,%20Nevada,%20United%20States%20of%20America&dpln=178276&date1=4/22/2026&date2=4/24/2026&crfrr=defaultFlex&SearchType=Place",
	"results_wanted": 30,
	"proxyConfiguration": {
		"useApifyProxy": true,
		"apifyProxyGroups": ["RESIDENTIAL"]
	}
}
```

---

## Sample Output

```json
{
	"car_offer_token": "4f278f4a-31db-4fbe-9a8f-6fc0a0f33f98",
	"offer_heading": "Midsize SUV",
	"reserve_button_text": "Reserve",
	"accessibility_string": "Midsize SUV from a major supplier in Las Vegas",
	"infosite_url": "https://www.expedia.com/carsearch/details?offerToken=...",
	"vehicle_category": "Midsize SUV",
	"vehicle_description": "Toyota RAV4 or similar",
	"vehicle_image_url": "https://images.trvl-media.com/cars/example-vehicle.png",
	"vendor_image_url": "https://images.trvl-media.com/cars/vendor-logo.png",
	"vehicle_attributes": ["5 seats", "Automatic", "Air conditioning"],
	"review_rating": 8.7,
	"review_label": "Very Good",
	"review_count": 1240,
	"price_lead": "$46/day",
	"price_total": "$184 total",
	"price_accessibility": "Total includes taxes and fees",
	"multi_item_price_token": "a0f9e58f-cb9c-4578-a4e3-241a5fdf9c62",
	"search_id": "8f58f2b5-3099-42f8-92ca-4b1ed7b5fd92",
	"pick_up_location": "Las Vegas, Nevada, United States of America",
	"drop_off_location": "Las Vegas, Nevada, United States of America",
	"pick_up_region": "178276",
	"drop_off_region": "178276",
	"pick_up_date": "2026-04-22",
	"drop_off_date": "2026-04-24",
	"pick_up_time": "1030AM",
	"drop_off_time": "1030AM",
	"page_index": 0,
	"operation_name": "CarSearchLite",
	"scraped_at": "2026-04-15T09:10:11.402Z"
}
```

---

## Tips For Best Results

### Use Residential Proxies
- Car rental pages can apply strong rate controls.
- Residential routing improves consistency and lowers block risk.

### Built-In Recovery
- The actor automatically heals encoded, alias-style, redirect-wrapped, and partially incomplete Expedia URLs.
- It also retries failed pages internally and pushes each successful page to the dataset immediately.

### Keep Date Inputs Valid
- Use future pickup/drop-off dates inside the Expedia URL.
- Keep pickup earlier than drop-off.

### Use Full Search URLs
- Prefer Expedia URLs that already include pickup, drop-off, region, and date parameters.
- The actor can heal wrapped or encoded links, but it still needs a real car search URL.

### Start Small Then Scale
- Start with `results_wanted: 20`.
- Increase page depth only after validating output quality.

### Expect Field Variance
- Offer cards are not always uniform.
- Records include only non-empty values.

---

## Integrations

- **Google Sheets** - Track daily pricing snapshots.
- **Airtable** - Build searchable rental offer databases.
- **Looker Studio** - Visualize price and category trends.
- **Webhooks** - Trigger downstream automation.

### Export Formats

- **JSON** - Best for API and analytics pipelines.
- **CSV** - Best for spreadsheet workflows.
- **Excel** - Best for operational reporting.
- **XML** - Best for legacy integrations.

---

## Frequently Asked Questions

### Why do some records have fewer fields?
Expedia cards vary by supplier and route. Empty fields are removed from output automatically.

### Can I run one-way searches?
Yes. Provide `dropLoc` and optionally `dropRegion` when pickup and drop-off differ.

### Why are proxies recommended?
Without stable proxy routing, high-volume runs may return rate-limit responses.

### Why did older versions stop near 29 results?
Expedia pagination expects an item offset, not sequential page numbers. This actor now advances by full page offsets so larger result targets continue past the first 20 offers correctly.

### Can I collect more than 20 offers?
Yes. Increase `results_wanted`, `max_pages`, and `page_size` based on your use case.

---

## Support

Use Apify Console support channels for bug reports and feature requests.

### Resources

- [Apify Documentation](https://docs.apify.com/)
- [Apify API Reference](https://docs.apify.com/api/v2)
- [Apify Scheduling](https://docs.apify.com/platform/schedules)

---

## Legal Notice

This actor is intended for legitimate data workflows. You are responsible for complying with website terms, applicable laws, and responsible data usage practices.