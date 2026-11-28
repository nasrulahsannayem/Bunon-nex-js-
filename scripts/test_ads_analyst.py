#!/usr/bin/env python3
"""Tests for ads-analyst.py — canonical dedup and funnel metrics."""
import unittest
import sys
import os

# Add scripts dir to path so we can import the module
sys.path.insert(0, os.path.dirname(__file__))

import ads_analyst


class TestCanonicalDedup(unittest.TestCase):
    """Test that canonical action aliases are deduplicated correctly."""

    def test_purchase_uses_canonical_when_present(self):
        """When both canonical and alias purchase actions present, use canonical only."""
        actions = [
            {"action_type": "purchase", "value": "10"},
            {"action_type": "omni_purchase", "value": "3"},
        ]
        result = ads_analyst.get_canonical_action(actions, "purchase")
        self.assertEqual(result, 10.0, "Should use canonical 'purchase', not sum aliases")

    def test_purchase_falls_back_to_alias(self):
        """When canonical purchase absent, use first present alias."""
        actions = [
            {"action_type": "omni_purchase", "value": "5"},
            {"action_type": "offsite_conversion.fb_pixel_purchase", "value": "7"},
        ]
        result = ads_analyst.get_canonical_action(actions, "purchase")
        self.assertEqual(result, 5.0, "Should use first present alias 'omni_purchase'")

    def test_no_matching_action_returns_zero(self):
        """When no matching action type, return 0."""
        actions = [{"action_type": "link_click", "value": "100"}]
        result = ads_analyst.get_canonical_action(actions, "purchase")
        self.assertEqual(result, 0.0)


class TestFunnelMetrics(unittest.TestCase):
    """Test funnel metric computation."""

    def test_roas_calculation(self):
        """ROAS = purchase_value / spend."""
        self.assertEqual(ads_analyst.calculate_roas(100.0, 10.0), 10.0)
        self.assertEqual(ads_analyst.calculate_roas(0.0, 10.0), 0.0)

    def test_cpa_calculation(self):
        """CPA = spend / purchases."""
        self.assertEqual(ads_analyst.calculate_cpa(100.0, 5), 20.0)
        self.assertEqual(ads_analyst.calculate_cpa(100.0, 0), 0.0)

    def test_compute_metrics_from_insight(self):
        """Compute full funnel metrics from a single insight row."""
        row = {
            "spend": "100.00",
            "impressions": "10000",
            "clicks": "500",
            "reach": "8000",
            "actions": [
                {"action_type": "purchase", "value": "5"},
                {"action_type": "landing_page_view", "value": "300"},
                {"action_type": "onsite_conversion.messaging_conversation_started_7d", "value": "20"},
            ],
            "action_values": [{"action_type": "purchase", "value": "350.00"}],
        }
        metrics = ads_analyst.compute_metrics(row)
        self.assertEqual(metrics["spend"], 100.0)
        self.assertEqual(metrics["pur"], 5.0)
        self.assertEqual(metrics["purchase_value"], 350.0)
        self.assertEqual(metrics["roas"], 3.5)
        self.assertEqual(metrics["cpa"], 20.0)
        self.assertEqual(metrics["lpv"], 300.0)
        self.assertEqual(metrics["msg_start"], 20.0)


if __name__ == "__main__":
    unittest.main()
