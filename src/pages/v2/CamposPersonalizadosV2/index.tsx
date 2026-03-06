
import { CustomFieldsManagerV2 } from '../../../components/v2/CustomFieldsV2/CustomFieldsManagerV2';
import { useAuth } from '../../../contexts/AuthContext';

export default function CamposPersonalizadosV2() {
    const { user } = useAuth();

    if (!user) {
        return null;
    }

    return (
        <div className="w-full">
            <CustomFieldsManagerV2 />
        </div>
    );
}
