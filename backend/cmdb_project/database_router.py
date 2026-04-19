"""
数据库路由配置
用于将PDU相关模型路由到PDU数据库
"""


class PDUDatabaseRouter:
    """
    PDU数据库路由
    将PDU相关模型路由到PDU数据库，其他模型使用默认数据库
    """
    
    # 需要路由到PDU数据库的模型
    pdu_models = {
        'PDUDevice',
        'PDUPort',
        'CabinetPDUData',
    }
    
    def db_for_read(self, model, **hints):
        """指定读取操作使用的数据库"""
        model_name = model._meta.label.split('.')[-1]
        if model_name in self.pdu_models:
            return 'pdu'
        return None
    
    def db_for_write(self, model, **hints):
        """指定写入操作使用的数据库"""
        model_name = model._meta.label.split('.')[-1]
        if model_name in self.pdu_models:
            return 'pdu'
        return None
    
    def allow_relation(self, obj1, obj2, **hints):
        """允许模型之间的关联"""
        # 如果两个模型都在PDU数据库中，允许关联
        db_set = {'pdu', 'default'}
        if obj1._state.db in db_set and obj2._state.db in db_set:
            return True
        return None
    
    def allow_migrate(self, db, app_label, model_name=None, **hints):
        """
        指定迁移操作使用的数据库
        
        关键逻辑：
        1. 对于pdu数据库，只允许包含PDU模型的迁移执行
        2. 对于其他数据库（default），允许所有迁移
        3. 如果指定了model_name，直接判断是否是PDU模型
        4. 如果没有指定model_name，检查迁移名称或迁移操作
        """
        # 对于pdu数据库，严格限制：只允许devices应用的PDU模型迁移
        if db == 'pdu':
            # 如果不是devices应用，拒绝在pdu数据库中执行迁移
            if app_label != 'devices':
                return False
            
            # 如果指定了model_name，检查是否是PDU模型
            if model_name:
                if model_name in self.pdu_models:
                    return True
                else:
                    # 非PDU模型不应该在PDU数据库中
                    return False
        
        # 如果指定了model_name，检查是否是PDU模型
        if model_name:
            if model_name in self.pdu_models:
                # PDU模型只在pdu数据库中创建
                return db == 'pdu'
            else:
                # 非PDU模型不应该在PDU数据库中
                if db == 'pdu':
                    return False
                # 对于default数据库，允许非PDU模型的迁移
                return None
        
        # 如果没有指定model_name，检查迁移名称和操作
        # 这部分逻辑只对devices应用有效
        if app_label == 'devices' and hints and 'migration' in hints:
            migration = hints['migration']
            if migration:
                migration_name = getattr(migration, 'name', '').lower()
                
                # 如果迁移名称包含 'pdu'，只在PDU数据库中执行
                if 'pdu' in migration_name:
                    return db == 'pdu'
                
                # 检查迁移操作中是否包含PDU模型的创建
                if hasattr(migration, 'operations'):
                    has_pdu_model = False
                    for operation in migration.operations:
                        # 检查CreateModel操作
                        if hasattr(operation, 'name') and operation.name in self.pdu_models:
                            has_pdu_model = True
                            break
                        # 检查AddField操作（如果字段属于PDU模型）
                        if hasattr(operation, 'model_name') and operation.model_name in self.pdu_models:
                            has_pdu_model = True
                            break
                    
                    if has_pdu_model:
                        # 包含PDU模型的迁移只在pdu数据库中执行
                        return db == 'pdu'
        
        # 对于pdu数据库，如果没有明确指示包含PDU模型，拒绝迁移
        if db == 'pdu':
            return False
        
        # 对于default数据库，对于devices应用的迁移，如果不是PDU相关的，允许执行
        # 如果是PDU相关的，应该被上面的逻辑拦截，返回False或True（只在pdu数据库）
        return None

