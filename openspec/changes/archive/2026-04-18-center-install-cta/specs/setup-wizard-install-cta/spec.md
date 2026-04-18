## ADDED Requirements

### Requirement: Install CTA is horizontally centered

The setup wizard configure step SHALL render the install call-to-action button ("Quick Install" or "Install & Enrich") horizontally centered within the footer, independent of selection state and independent of install tier.

#### Scenario: Quick tier
- **WHEN** the configure step footer is rendered with `config.tier === 'quick'`
- **THEN** the install button labelled "Quick Install" is rendered horizontally centered within the footer

#### Scenario: Full tier
- **WHEN** the configure step footer is rendered with `config.tier === 'full'`
- **THEN** the install button labelled "Install & Enrich" is rendered horizontally centered within the footer

### Requirement: Skip control remains left-anchored

The "Skip for now" control in the configure step footer SHALL remain anchored at the left edge of the footer, and SHALL NOT visually overlap the centered install button at the wizard's supported minimum width.

#### Scenario: Skip position
- **WHEN** the configure step footer is rendered
- **THEN** the "Skip for now" control is the left-most interactive element in the footer
- **AND** the centered install button does not visually overlap the "Skip for now" control at the wizard's supported minimum width
