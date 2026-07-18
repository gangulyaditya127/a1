""" import setuptools

setuptools.setup(
    name='AREPython',
    version='1.0',
    long_description=__doc__,
    packages=setuptools.find_packages(),
    include_package_data=True,
    zip_safe=True,
    #install_requires=["scikit-learn>=0.23.1", "pandas>=1.0.5", "numpy>=1.19.1", "flask>=1.1.2"]
    install_requires=["scikit-learn", "pandas", "numpy", "flask","cx_Oracle"]
)

This is a test file
 """