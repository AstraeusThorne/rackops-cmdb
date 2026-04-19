"""
报表模块常量：弱电报告额定值、阈值等。

所有数值均优先从 system_config 表读取（category=pdu_report）；
若表中无对应 key 则使用本文件缺省值。缺省项可通过 common 迁移 0007_seed_pdu_report_config 写入表。
"""

# 弱电月报配置键（与 SystemConfig 可选键一致）
PDU_RATED_CURRENT_PER_CIRCUIT_KEY = 'pdu_rated_current_per_circuit'
CABINET_U_CAPACITY_KEY = 'cabinet_u_capacity'
PDU_HIGH_UTILIZATION_THRESHOLD_KEY = 'pdu_high_utilization_threshold'
PDU_CURRENT_WARNING_THRESHOLD_KEY = 'pdu_current_warning_threshold'
PDU_REDUNDANCY_IMBALANCE_RATIO_KEY = 'pdu_redundancy_imbalance_ratio'

# 缺省值
DEFAULT_RATED_CURRENT_PER_CIRCUIT = 32   # A
DEFAULT_CABINET_U_CAPACITY = 42          # U/柜
DEFAULT_HIGH_UTILIZATION_THRESHOLD = 80  # %
DEFAULT_CURRENT_WARNING_THRESHOLD = 60   # %，达到此值未达高利用率阈值时记为电流预警
DEFAULT_REDUNDANCY_IMBALANCE_RATIO = 0.5  # B路 < A路*ratio 视为不均衡


def get_pdu_report_config():
    """
    获取弱电报告配置（额定电流、U 位、阈值）。
    优先从 SystemConfig 读取，否则使用 constants 缺省值。

    Returns:
        dict: rated_current_per_circuit, cabinet_u_capacity,
              high_utilization_threshold, redundancy_imbalance_ratio
    """
    try:
        from common.models import SystemConfig
        configs = {}
        for key, default in [
            (PDU_RATED_CURRENT_PER_CIRCUIT_KEY, DEFAULT_RATED_CURRENT_PER_CIRCUIT),
            (CABINET_U_CAPACITY_KEY, DEFAULT_CABINET_U_CAPACITY),
            (PDU_HIGH_UTILIZATION_THRESHOLD_KEY, DEFAULT_HIGH_UTILIZATION_THRESHOLD),
            (PDU_CURRENT_WARNING_THRESHOLD_KEY, DEFAULT_CURRENT_WARNING_THRESHOLD),
            (PDU_REDUNDANCY_IMBALANCE_RATIO_KEY, DEFAULT_REDUNDANCY_IMBALANCE_RATIO),
        ]:
            try:
                obj = SystemConfig.objects.get(key=key)
                val = obj.get_value()
                if isinstance(val, (int, float)):
                    configs[key] = val
                else:
                    configs[key] = default
            except SystemConfig.DoesNotExist:
                configs[key] = default
        return {
            'rated_current_per_circuit': configs.get(PDU_RATED_CURRENT_PER_CIRCUIT_KEY, DEFAULT_RATED_CURRENT_PER_CIRCUIT),
            'cabinet_u_capacity': configs.get(CABINET_U_CAPACITY_KEY, DEFAULT_CABINET_U_CAPACITY),
            'high_utilization_threshold': configs.get(PDU_HIGH_UTILIZATION_THRESHOLD_KEY, DEFAULT_HIGH_UTILIZATION_THRESHOLD),
            'current_warning_threshold': configs.get(PDU_CURRENT_WARNING_THRESHOLD_KEY, DEFAULT_CURRENT_WARNING_THRESHOLD),
            'redundancy_imbalance_ratio': configs.get(PDU_REDUNDANCY_IMBALANCE_RATIO_KEY, DEFAULT_REDUNDANCY_IMBALANCE_RATIO),
        }
    except Exception:
        return {
            'rated_current_per_circuit': DEFAULT_RATED_CURRENT_PER_CIRCUIT,
            'cabinet_u_capacity': DEFAULT_CABINET_U_CAPACITY,
            'high_utilization_threshold': DEFAULT_HIGH_UTILIZATION_THRESHOLD,
            'current_warning_threshold': DEFAULT_CURRENT_WARNING_THRESHOLD,
            'redundancy_imbalance_ratio': DEFAULT_REDUNDANCY_IMBALANCE_RATIO,
        }
