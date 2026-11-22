from unittest.mock import MagicMock

from app.feature_store import VELOCITY_KEY_PREFIX, VELOCITY_TTL_SECONDS, RedisFeatureStore


def test_redis_feature_store_executes_atomic_zset_pipeline():
    mock_pipe = MagicMock()
    mock_pipe.execute.return_value = [0, 1, 5, 8, 12, True]

    mock_client = MagicMock()
    mock_client.pipeline.return_value = mock_pipe

    store = RedisFeatureStore(client=mock_client)
    vel = store.record_and_get_velocity("user-1042", "tx-1", 1_700_000_000.0)

    assert vel.tx_count_1m == 5
    assert vel.tx_count_10m == 8
    assert vel.tx_count_1h == 12

    expected_key = f"{VELOCITY_KEY_PREFIX}user-1042"
    mock_pipe.zremrangebyscore.assert_called_once_with(expected_key, "-inf", 1_700_000_000.0 - 3600)
    mock_pipe.zadd.assert_called_once_with(expected_key, {"tx-1": 1_700_000_000.0})
    mock_pipe.expire.assert_called_once_with(expected_key, VELOCITY_TTL_SECONDS)


def test_redis_feature_store_falls_back_gracefully_on_connection_error():
    mock_client = MagicMock()
    mock_client.pipeline.side_effect = ConnectionError("Redis unavailable")

    store = RedisFeatureStore(client=mock_client)
    vel = store.record_and_get_velocity("user-1042", "tx-fail", 1_700_000_000.0)

    assert vel.tx_count_1m == 1
    assert vel.tx_count_10m == 1
    assert vel.tx_count_1h == 1
