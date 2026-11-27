"""Catch payload changes that require a trailer and report refresh."""
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"


def payload(name):
    return json.loads((WEB / "data" / f"{name}.json").read_text(encoding="utf-8"))


@unittest.skipUnless((WEB / "dev" / "trailer.html").exists(), "trailer maker is not included")
class TrailerFactsTest(unittest.TestCase):
    def test_city_figures(self):
        cities = {city["id"]: city for city in payload("cities")}
        toronto = cities["535"]
        self.assertEqual((toronto["gdp"], toronto["gdp_year"], toronto["population"]),
                         (522379000000, 2022, 7108874))
        vancouver = cities["933"]
        self.assertEqual((vancouver["gdp"], vancouver["gdp_year"], vancouver["population"],
                          vancouver["median_income"]), (202459000000, 2022, 3088036, 90000))

    def test_counts(self):
        self.assertEqual(len(payload("lenses")["lenses"]), 18)
        self.assertEqual(len(payload("sources")), 35)
        self.assertEqual(len(payload("towns")["towns"]), 109)
        self.assertEqual(payload("disasters")["summary"]["mapped_distinct_event_ids"], 1103)
        self.assertEqual(len(payload("resources")["crops"]["cells"]), 687)
        self.assertEqual(len(payload("election2025")["ridings"]), 343)


if __name__ == "__main__":
    unittest.main()
