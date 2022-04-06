const neAttribution = "Coordinates and elevations from " +
  newTabLink("https://www.naturalearthdata.com/", "Natural Earth");
const noImage = "<p>(No image)</p>";

export function getWikiData(wikidataid) {
  if (!wikidataid || !wikidataid.length) {
    const data = {
      image: noImage,
      text: "",
      sources: "<p><i>" + neAttribution + "</i></p>",
    };
    return Promise.resolve(data);
  }

  const root = "https://www.wikidata.org/wiki/Special:EntityData/";
  const url = root + wikidataid + ".json";
  return fetch(url, { method: "GET" })
    .then(response => response.json())
    .then(data => parseEntityData(data.entities[wikidataid]));
}

function parseEntityData(data) {
  const { labels, descriptions, claims, sitelinks } = data;

  // All of these would be better done with optional chaining,
  // but we do it clumsily to make sure we can run on old Androids
  const label = (labels && labels.en)
    ? labels.en.value
    : undefined;
  const description = (descriptions && descriptions.en)
    ? descriptions.en.value
    : undefined;
  const mainsnak = (claims && claims.P18 && claims.P18[0])
    ? claims.P18[0].mainsnak
    : undefined;
  const imagefile = (mainsnak && mainsnak.datavalue)
    ? mainsnak.datavalue.value
    : undefined;
  const sitelink = (sitelinks && sitelinks.enwiki)
    ? sitelinks.enwiki.url
    : undefined;

  const image = (imagefile && imagefile.length)
    ? '<img src="' + getImageSrc(imagefile) + '">'
    : noImage;

  const text = (description)
    ? "<p><b>Description:</b> " + description + "</p>"
    : "";

  const wikiAttribution = newTabLink("https://www.wikidata.org/", "WikiData");
  const moreinfo = (label && sitelink)
    ? newTabLink(sitelink, label + " on Wikipedia")
    : "";
  const sources = "<p>" + moreinfo + "</p>" +
    "<p><i>" + neAttribution + ".<br>" +
    "Other information from " + wikiAttribution + ".</i></p>";

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
