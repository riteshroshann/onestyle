// Public-domain (CC0) photographs, via Openverse. Sources and licences are listed in public/licenses.txt.
export interface Photo { src: string; alt: string; caption: string }

const p = (id: string, alt: string, caption: string): Photo => ({ src: `/photos/${id}.webp`, alt, caption });

export const PHOTOS = {
  steps: p("066", "A model in a strapless draped evening gown standing on stone steps at dusk", "Draped evening gown. Library of Congress."),
  profile: p("013", "A model in a satin evening gown and long gloves, in profile beside the water", "Satin gown with opera gloves. Library of Congress."),
  horizon: p("052", "A model in a full-skirted gown against an evening sky", "Full skirt, fitted bodice. Library of Congress."),
  silhouette: p("064", "The silhouette of a model in a gown with a long train at sunset", "A train, in silhouette. Library of Congress."),
  monument: p("094", "A model in a pale gown standing by the water", "Pale gown by the water. Library of Congress."),
  dusk: p("096", "A model in a dark gown seen from the side at dusk", "Evening gown at dusk. Library of Congress."),
  backs: p("074", "Three models seen from behind in low-backed swimsuits, one wearing a wide straw hat", "Three low backs. Library of Congress."),
  tennis: p("030", "A model in a short tennis dress leaning on a terrace wall", "Tennis dress. Library of Congress."),
  underwater: p("031", "A model in a long white dress floating underwater", "A dress, underwater. Library of Congress."),
  llamas: p("083", "A model in a wide swing coat standing on a hillside", "Swing coat. Library of Congress."),
  flare: p("073", "A model in a fitted dark gown with a flared hem", "Fitted to the knee, then flared. The J. Paul Getty Museum."),
  seamstress: p("061", "A seamstress bent over a sewing machine threaded with cones of yarn", "At the machine. The J. Paul Getty Museum."),
  shears: p("069", "Shears and a spool of thread lying on pinstriped cloth", "Shears on pinstripe."),
  sari: p("107", "A woven silk sari with a patterned border", "Silk sari. The Art Institute of Chicago."),
} satisfies Record<string, Photo>;
