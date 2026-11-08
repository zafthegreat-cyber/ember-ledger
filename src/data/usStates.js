// All 50 states and DC. ZIP prefixes suggest a state; they do not validate
// an address, locate a store, or establish state boundaries. Explicit state
// choices always take priority. No store/stock records are generated here.
// Sources checked 2026-11-07:
// https://pe.usps.com/text/pub28/28apb.htm
// https://www.ftb.ca.gov/forms/misc/923.html (section 7)
export const US_STATES = [
  ["AL", "Alabama", [[350, 369]]],
  ["AK", "Alaska", [[995, 999]]],
  ["AZ", "Arizona", [[850, 865]]],
  ["AR", "Arkansas", [[716, 729]]],
  ["CA", "California", [[900, 961]]],
  ["CO", "Colorado", [[800, 816]]],
  ["CT", "Connecticut", [[60, 69]]],
  ["DE", "Delaware", [[197, 199]]],
  ["DC", "District of Columbia", [[200, 200], [202, 205]]],
  ["FL", "Florida", [[320, 339], [341, 349]]],
  ["GA", "Georgia", [[300, 319], [398, 399]]],
  ["HI", "Hawaii", [[967, 968]]],
  ["ID", "Idaho", [[832, 838]]],
  ["IL", "Illinois", [[600, 629]]],
  ["IN", "Indiana", [[460, 479]]],
  ["IA", "Iowa", [[500, 528]]],
  ["KS", "Kansas", [[660, 679]]],
  ["KY", "Kentucky", [[400, 427]]],
  ["LA", "Louisiana", [[700, 714]]],
  ["ME", "Maine", [[39, 49]]],
  ["MD", "Maryland", [[206, 219]]],
  ["MA", "Massachusetts", [[10, 27], [55, 55]]],
  ["MI", "Michigan", [[480, 499]]],
  ["MN", "Minnesota", [[550, 567]]],
  ["MS", "Mississippi", [[386, 397]]],
  ["MO", "Missouri", [[630, 658]]],
  ["MT", "Montana", [[590, 599]]],
  ["NE", "Nebraska", [[680, 693]]],
  ["NV", "Nevada", [[889, 898]]],
  ["NH", "New Hampshire", [[30, 38]]],
  ["NJ", "New Jersey", [[70, 89]]],
  ["NM", "New Mexico", [[870, 884]]],
  ["NY", "New York", [[4, 5], [100, 149]]],
  ["NC", "North Carolina", [[270, 289]]],
  ["ND", "North Dakota", [[580, 588]]],
  ["OH", "Ohio", [[430, 459]]],
  ["OK", "Oklahoma", [[730, 731], [734, 749]]],
  ["OR", "Oregon", [[970, 979]]],
  ["PA", "Pennsylvania", [[150, 196]]],
  ["RI", "Rhode Island", [[28, 29]]],
  ["SC", "South Carolina", [[290, 299]]],
  ["SD", "South Dakota", [[570, 577]]],
  ["TN", "Tennessee", [[370, 385]]],
  ["TX", "Texas", [[733, 733], [750, 799], [885, 885]]],
  ["UT", "Utah", [[840, 847]]],
  ["VT", "Vermont", [[50, 54], [56, 59]]],
  ["VA", "Virginia", [[201, 201], [220, 246]]],
  ["WA", "Washington", [[980, 994]]],
  ["WV", "West Virginia", [[247, 268]]],
  ["WI", "Wisconsin", [[530, 549]]],
  ["WY", "Wyoming", [[820, 831]]],
].map(([code, name, zipPrefixes]) => ({
  code, name, shortName: code === "DC" ? "Washington, DC" : name, zipPrefixes,
}));

// Specific five-digit exceptions take precedence over three-digit ranges.
// Territory and military ZIPs must not silently select a nearby state.
export const ZIP_STATE_EXCEPTIONS = {
  "06390": "NY", "20799": "DC", "20331": "MD", "20335": "MD",
  "20301": "VA", "20370": "VA", "20040": "VA",
  "71233": "MS", "73949": "TX", "49936": "WI", "96799": "",
};
