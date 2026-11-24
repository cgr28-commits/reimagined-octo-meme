import AttractionLibrary from "@/components/private-tours/AttractionLibrary";

export default function AttractionsPage() {
  return (
    <section className="pt-hero pt-wrap">
      <p className="pt-kicker">Attraction library</p>
      <h1 style={{ marginTop: 8 }}>Places we love to take you</h1>
      <p className="lead">Every place here is hand-picked, with realistic visit times, opening days and mobility notes. Add any of them to your own day.</p>
      <AttractionLibrary />
    </section>
  );
}
