# API Discovery Notes

## Selected API
- Endpoint: `https://www.expedia.com/graphql`
- Method: `POST`
- Operation: `CarSearchV3` (custom actor query name: `CarSearchLite`)
- Auth: Anonymous session plus anti-bot cookie bootstrap from carsearch page
- Required headers:
	- `Client-Info: bernie-cars-shopping-web,pwa,us-east-1`
	- `client-info: domain-redirect:true`
	- `Device-User-Agent-ID: <DUAID>`
	- `x-page-id: page.Car-Search,C,20`
- Required variables:
	- `context`
	- `primaryCarSearchCriteria`
	- `secondaryCriteria`
	- `shoppingContext`
- Data path: `data.carSearchOrRecommendations.carSearchResults.listings`
- Pagination hint path: `data.carSearchOrRecommendations.carSearchResults.loadMoreAction.searchPagination`
- Pagination note: `selPageIndex` behaves like a starting offset, not a sequential page number. Advancing by `20, 40, 60...` returns new batches correctly.

## Discovery Evidence
- Decoded `window.__PLUGIN_STATE__` from Expedia `carsearch` response and found:
	- `bexApiUrl` GraphQL backend configuration
	- `apollo.clientInfo` value used by the cars frontend
	- `graphqlURL` route (`/graphql`)
- Inspected `app.cf65f7ae8d44973e2477.js` bundle and confirmed:
	- Query operations: `ComparableDealsQuery`, `CarDetailV2`, `CarDropOffSearch`, `CarSearchV3`
	- API method wiring via `GraphQLClient.rawRequest(...)`
	- Header injection of `Client-Info` and `x-page-id`
	- Runtime `searchVariables` builder for car criteria and sort/pagination selections

## Selected Response Fields
- `car_offer_token`
- `offer_heading`
- `reserve_button_text`
- `accessibility_string`
- `infosite_url`
- `vehicle_category`
- `vehicle_description`
- `vehicle_image_url`
- `vendor_image_url`
- `vehicle_attributes`
- `review_rating`
- `review_label`
- `review_count`
- `price_lead`
- `price_total`
- `price_accessibility`
- `strike_through_first`
- `multi_item_price_token`
- `fare_comparison_enabled`
- `price_summary_text`
- `selected_accessories`
- `reward_points_selection`
- `continuation_contextual_id`
- `search_id`

## API Selection Score
| Score Factor | Points |
|---|---|
| Returns JSON directly | +30 |
| Has >15 unique fields | +25 |
| No auth required | +0 |
| Has pagination support | +15 |
| Matches or extends current fields | +10 |
| **Total** | **80** |

## Final Decision
Use `got-scraping` with direct GraphQL calls to Expedia car search API. Bootstrap cookies from the user-provided carsearch URL, auto-heal messy Expedia links when enabled, advance pagination by item offset, and map only non-empty offer fields to the dataset.
