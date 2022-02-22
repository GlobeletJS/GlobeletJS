export function getWikiData(wikidataid) {
  if (!wikidataid || !wikidataid.length) return Promise.resolve({});

  const root = "https://www.wikidata.org/wiki/Special:EntityData/";
  const url = root + wikidataid + ".json";
  return fetch(url, { method: "GET" })
    .then(response => response.json())
    .then(data => parseEntityData(data.entities[wikidataid]));
}

function parseEntityData(data) {
  const { labels, descriptions, claims, sitelinks } = data;

  const label = labels?.en?.value;
  const description = descriptions?.en?.value;
  const imagefile = claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  const sitelink = sitelinks?.enwiki?.url;

  const image = (imagefile && imagefile.length)
    ? '<img src="' + getImageSrc(imagefile) + '">'
    : "<p>(No image)</p>";

  const text = (description)
    ? "<p><b>Description:</b> " + description + "</p>"
    : "";

  const attribution = newTabLink("https://www.wikidata.org/", "WikiData");
  const moreinfo = (label && sitelink)
    ? newTabLink(sitelink, label + " on Wikipedia")
    : "";
  const sources = "<p>" + moreinfo + "</p>" +
    "<p><i>Source: " + attribution + "</i></p>"; 

  return { image, text, sources };
}

function newTabLink(href, text) {
  return '<a href="' + href + '" target="_blank">' + text + "</a>";
}

function getImageSrc(filename) {
  const root = "https://commons.wikimedia.org/w/thumb.php?width=480&f=";
  const re = / /g;

  return root + filename.replace(re, "_");
}
