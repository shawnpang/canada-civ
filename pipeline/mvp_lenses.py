"""MVP lens data from Census Profile 2021 and the sampled 2020 land cover.

Census values are CD-level aggregates, assigned to a hex by the sampled CD
boundary. A blank or suppressed census observation is never converted to zero.
"""


def bilingual(en, fr):
    return {'en': en, 'fr': fr}


def fraction(numerator, denominator):
    """Return a proportion only for valid and internally consistent counts."""
    if numerator is None or denominator is None or denominator <= 0:
        return None
    value = numerator / denominator
    return value if 0 <= value <= 1 else None


def domain(values):
    values = sorted(value for value in values if value is not None)
    if not values:
        return [0, 1]
    return [values[int((len(values)-1)*.02)], values[int((len(values)-1)*.98)]]


def build(world, profiles):
    """Return the lens payload for a world with census-division assignments."""
    divisions = world['divisions']
    owner = world['owner']
    water = world['water']
    assignments = world['division']
    def profile_at(index):
        cd = assignments[index]
        if owner[index] < 0 or water[index] != 0 or not 0 <= cd < len(divisions):
            return {}
        return profiles.get('2021A0003' + divisions[cd]['cduid'], {})

    measures = {
        'density': lambda p: p.get('6'),
        'income': lambda p: p.get('229'),
        'home': lambda p: p.get('1474'),
        'poverty': lambda p: fraction(p.get('331'), 100),
        'age': lambda p: p.get('40'),
        'bachelors': lambda p: fraction(p.get('2024'), p.get('2014')),
        'official_language': lambda p: fraction(p.get('376'), p.get('374')),
    }
    common_note = bilingual(
        'Census division values are assigned to whole hexes; they do not describe variation within a division. Suppressed and missing observations remain blank.',
        'Les valeurs des divisions de recensement sont attribuées aux hexagones entiers; elles ne décrivent pas les variations au sein d’une division. Les données supprimées ou manquantes restent vides.')
    cover_note = bilingual(
        'Share of valid 2020 land-cover samples on a 6 km lattice within the hex; approximate, not a cadastral survey. Cells with no valid samples remain blank.',
        'Part des échantillons valides de couverture terrestre de 2020 sur une grille de 6 km dans l’hexagone; estimation approximative, non cadastrale. Les cellules sans échantillon valide restent vides.')
    specs = [
        ('density', 'people', 'Population density', 'Densité de population', 'people / km²', 'personnes / km²', 'float', 'log', 'Population density per square kilometre, 2021 Census.', 'Densité de population par kilomètre carré, Recensement de 2021.'),
        ('income', 'people', 'Household income', 'Revenu des ménages', 'CAD', 'CAD', 'cad', 'log', 'Median total household income in 2020, before tax.', 'Revenu total médian des ménages en 2020, avant impôt.'),
        ('home', 'people', 'Dwelling value', 'Valeur des logements', 'CAD', 'CAD', 'cad', 'log', 'Median value of owner-occupied private dwellings, excluding farms and reserves, 2021 Census.', 'Valeur médiane des logements privés occupés par leur propriétaire, excluant les fermes et les réserves, Recensement de 2021.'),
        ('poverty', 'people', 'Low income', 'Faible revenu', 'share', 'part', 'pct', 'linear', 'Prevalence of low income based on the after-tax low-income measure (LIM-AT).', 'Prévalence du faible revenu fondée sur la mesure de faible revenu après impôt (MFR-ApI).'),
        ('age', 'people', 'Median age', 'Âge médian', 'years', 'ans', 'years', 'linear', 'Median age of the population, 2021 Census.', 'Âge médian de la population, Recensement de 2021.'),
        ('bachelors', 'people', 'Bachelor’s degree or higher', 'Baccalauréat ou grade supérieur', 'share', 'part', 'pct', 'linear', 'Share of people aged 25 to 64 in private households with a bachelor’s degree or higher.', 'Part des personnes de 25 à 64 ans dans les ménages privés titulaires d’un baccalauréat ou d’un grade supérieur.'),
        ('forest', 'land', 'Forest', 'Forêt', 'share', 'part', 'pct', 'linear', 'Forest share of sampled land cover, 2020.', 'Part de forêt dans les échantillons de couverture terrestre, 2020.'),
        ('farmland', 'land', 'Cropland', 'Terres cultivées', 'share', 'part', 'pct', 'linear', 'Cropland share of sampled land cover, 2020; excludes pasture.', 'Part des terres cultivées dans les échantillons de couverture terrestre, 2020; exclut les pâturages.'),
        ('developed', 'land', 'Developed land', 'Terres aménagées', 'share', 'part', 'pct', 'linear', 'Developed share of sampled land cover, 2020.', 'Part des terres aménagées dans les échantillons de couverture terrestre, 2020.'),
        ('official_language', 'language', 'French first official language', 'Français comme première langue officielle', 'share', 'part', 'pct', 'linear', 'Share with French as first official language spoken, excluding English and French combined responses; population excluding institutional residents.', 'Part ayant le français comme première langue officielle parlée, à l’exclusion des réponses « anglais et français »; population à l’exclusion des pensionnaires d’un établissement institutionnel.'),
    ]
    output = []
    cover_keys = {'forest': 'forest', 'farmland': 'crop', 'developed': 'developed'}
    for ident, group, en, fr, unit_en, unit_fr, fmt, scale, desc_en, desc_fr in specs:
        if ident in cover_keys:
            data = world['pct'][cover_keys[ident]]
            values = [data[i] / 100 if owner[i] >= 0 and water[i] == 0 and world['cover'][i] > 0 else None for i in range(len(owner))]
            source, note = 'nrcan_landcover_2020', cover_note
        else:
            values = [measures[ident](profile_at(i)) for i in range(len(owner))]
            source, note = 'statcan_census_2021_profile', common_note
        limits = domain(values)
        # Zero-density divisions are real, but a logarithmic scale needs a
        # strictly positive lower bound. Keep the observations unchanged.
        if scale == 'log' and limits[0] <= 0:
            positive = [value for value in values if value is not None and value > 0]
            if positive:
                limits[0] = min(positive)
                limits[1] = max(limits[0], limits[1])
        output.append({'id': ident, 'group': group, 'name': bilingual(en, fr),
                       'unit': bilingual(unit_en, unit_fr), 'format': fmt, 'scale': scale,
                       'domain': limits, 'ramp': ['#1b2838', '#e6c35c'],
                       'higher_is': 'neutral', 'source': source,
                       'description': bilingual(desc_en, desc_fr), 'note': note, 'values': values})
    return {'vintage': 'Census 2021; land cover 2020',
            'groups': [{'id': 'people', 'name': bilingual('People', 'Population')},
                       {'id': 'land', 'name': bilingual('Land', 'Territoire')},
                       {'id': 'language', 'name': bilingual('Language', 'Langue')}],
            'lenses': output}
