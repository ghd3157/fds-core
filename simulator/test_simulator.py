from pathlib import Path

from simulator import traffic_simulator as sim


def test_payload_builders_match_v2_krw_contract():
    normal = sim.build_normal_payload("user-test-1")
    assert normal["userId"] == "user-test-1"
    assert normal["amount"] > 0
    assert "+09:00" in normal["transactionDate"]

    high = sim.build_high_amount_payload("user-test-2")
    assert high["amount"] >= 1_500_000

    night = sim.build_night_risk_payload("user-test-3")
    assert night["amount"] >= 300_000
    assert night["merchantCategory"] in sim.NIGHT_HIGH_RISK_CATEGORIES

    burst = sim.build_burst_payload("user-burst", 3)
    assert burst["userId"] == "user-burst"
    assert "sim-burst-03-" in burst["transactionId"]


def test_cli_dry_run_modes(tmp_path: Path):
    assert sim.main(["--mode", "burst", "--count", "3", "--interval", "0", "--dry-run"]) == 0
    assert sim.main(["--mode", "scenario", "--type", "high-amount", "--dry-run"]) == 0
    assert sim.main(["--mode", "scenario", "--type", "night-risk", "--dry-run"]) == 0
    assert sim.main(["--mode", "mixed", "--tps", "20", "--duration", "0.2", "--dry-run"]) == 0

    csv_file = tmp_path / "sample.csv"
    csv_file.write_text(
        "trans_num,cc_num,amt,category,merch_lat,merch_long,is_fraud\n"
        "t1,123456789012,50.0,grocery_pos,37.5,127.0,0\n"
        "t2,123456789012,1200.0,shopping_net,37.5,127.0,1\n",
        encoding="utf-8",
    )
    assert sim.main(["--mode", "csv", "--file", str(csv_file), "--tps", "100", "--limit", "2", "--dry-run"]) == 0
